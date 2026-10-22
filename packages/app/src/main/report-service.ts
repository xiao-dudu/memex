import {
  reportCandidateQuerySchema,
  reportGenerateSchema,
  type Report,
  type ReportCandidate,
  type ReportGenerateInput,
  type ReportNoteSnapshot,
  type ReportRepository,
  type ReportTaskSnapshot,
  type ReportTemplateRepository,
  type ReportTemplateSnapshot,
} from '@memex/shared';
import type { AiConfigStore } from './ai-config.js';
import { AiRequestError, requestChatCompletion } from './ai-client.js';
import { buildReportMessages } from './report-prompt.js';

const MAX_CANDIDATES = 1_000;
const MAX_NOTE_CHARS = 20_000;
const MAX_PROMPT_CHARS = 120_000;
const DEFAULT_TIMEOUT_MS = 90_000;

export interface ReportServiceDependencies {
  templates: ReportTemplateRepository;
  reports: ReportRepository;
  aiConfig: AiConfigStore;
  request: typeof requestChatCompletion;
  now: () => number;
}

export interface ReportService {
  listCandidates(periodStart: number, periodEnd: number): ReportCandidate[];
  generate(input: ReportGenerateInput, signal: AbortSignal): Promise<Report>;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultTitle(periodStart: number, periodEnd: number): string {
  return `${formatLocalDate(periodStart)} 至 ${formatLocalDate(periodEnd - 1)} 周报`;
}

function templateSnapshot(template: {
  name: string;
  description: string | null;
  basePrompt: string;
  sections: ReportTemplateSnapshot['sections'];
  constraints: string;
}): ReportTemplateSnapshot {
  return {
    name: template.name,
    description: template.description,
    basePrompt: template.basePrompt,
    sections: template.sections,
    constraints: template.constraints,
  };
}

function publicBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl.trim());
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return baseUrl.trim();
  }
}

export function createReportService(deps: ReportServiceDependencies): ReportService {
  return {
    listCandidates(periodStart, periodEnd) {
      const period = reportCandidateQuerySchema.parse({ periodStart, periodEnd });
      const candidates = deps.reports.listCandidates(period.periodStart, period.periodEnd);
      if (candidates.length > MAX_CANDIDATES) throw new Error('候选任务超过 1,000 条，请缩小时间范围');
      return candidates;
    },

    async generate(input, signal) {
      const parsed = reportGenerateSchema.parse(input);
      if (signal.aborted) throw new AiRequestError('CANCELLED', '已取消生成');

      const template = deps.templates.get(parsed.templateId);
      if (!template) throw new Error('模板不存在或已被删除');

      const selected = deps.reports.getSelectedTasks(parsed.taskIds);
      if (selected.length !== new Set(parsed.taskIds).size) {
        throw new Error('任务数据已变化，请重新加载');
      }

      const periodCandidates = deps.reports.listCandidates(parsed.periodStart, parsed.periodEnd);
      if (periodCandidates.length > MAX_CANDIDATES) {
        throw new Error('候选任务超过 1,000 条，请缩小时间范围');
      }
      const candidateIds = new Set(periodCandidates.map((candidate) => candidate.id));
      if (selected.some((task) => !candidateIds.has(task.id))) {
        throw new Error('任务数据已变化，请重新加载');
      }

      const linkedNotes = parsed.includeNotes ? deps.reports.getLinkedNotes(parsed.taskIds) : [];
      const oversizedNote = linkedNotes.find((note) => note.plainText.length > MAX_NOTE_CHARS);
      if (oversizedNote) {
        throw new Error(`关联笔记“${oversizedNote.title}”超过 20,000 字符，无法生成`);
      }

      const notesByTaskId = new Map<string, ReportNoteSnapshot>();
      if (parsed.includeNotes) {
        const notesById = new Map(linkedNotes.map((note) => [note.id, note]));
        for (const task of selected) {
          const note = task.noteId ? notesById.get(task.noteId) : undefined;
          if (note) notesByTaskId.set(task.id, note);
        }
      }

      const taskSnapshots: ReportTaskSnapshot[] = selected.map((task) => {
        const note = notesByTaskId.get(task.id);
        return note ? { ...task, note } : { ...task };
      });
      const messages = buildReportMessages(templateSnapshot(template), {
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        tasks: taskSnapshots,
        notes: linkedNotes,
      });
      const promptChars = messages.reduce((total, message) => total + message.content.length, 0);
      if (promptChars > MAX_PROMPT_CHARS) {
        throw new Error('发送内容超过 120,000 字符，请缩小时间范围或减少任务/笔记');
      }

      if (signal.aborted) throw new AiRequestError('CANCELLED', '已取消生成');
      const credentials = deps.aiConfig.getCredentials();
      if (!credentials.baseUrl.trim() || !credentials.model.trim()) throw new Error('请先配置 AI 服务');
      const currentConfig = deps.aiConfig.getPublic();
      if (currentConfig.revision !== parsed.aiConfigRevision) {
        throw new Error('AI 服务配置已变化，请重新确认');
      }

      const startedAt = deps.now();
      const completion = await deps.request(
        {
          baseUrl: credentials.baseUrl,
          model: credentials.model,
          apiKey: credentials.apiKey,
          timeoutMs: credentials.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
        messages,
        undefined,
        signal,
      );
      if (signal.aborted) throw new AiRequestError('CANCELLED', '已取消生成');
      if (!completion.content.trim()) throw new Error('模型返回内容为空');

      const generatedAt = deps.now();
      return deps.reports.create({
        title: defaultTitle(parsed.periodStart, parsed.periodEnd),
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        templateId: template.id,
        template: templateSnapshot(template),
        tasks: taskSnapshots,
        notes: linkedNotes,
        contentMarkdown: completion.content,
        generationMeta: {
          model: credentials.model,
          baseUrl: publicBaseUrl(credentials.baseUrl),
          generatedAt,
          durationMs: Math.max(0, generatedAt - startedAt),
          promptChars,
          ...(completion.usage ? { usage: completion.usage } : {}),
        },
      });
    },
  };
}
