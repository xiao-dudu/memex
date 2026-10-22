import type { ReportNoteSnapshot, ReportTaskSnapshot, ReportTemplateSnapshot } from '@memex/shared';
import { REPORT_SYSTEM_RULES } from '@memex/shared';
import type { ChatMessage } from './ai-client.js';

export interface ReportPromptData {
  periodStart: number;
  periodEnd: number;
  tasks: ReportTaskSnapshot[];
  notes: ReportNoteSnapshot[];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

function renderTemplate(template: ReportTemplateSnapshot): string {
  const sections = template.sections
    .map(
      (section, index) =>
        `${index + 1}. ${section.title}\n   写作要求：${section.instruction || '无'}\n   允许为空：${section.allowEmpty ? '是' : '否'}`,
    )
    .join('\n');
  return [
    `名称：${template.name}`,
    `说明：${template.description || '无'}`,
    `基础提示词：${template.basePrompt}`,
    '章节：',
    sections,
    `自定义约束：${template.constraints || '无'}`,
  ].join('\n');
}

export function buildReportMessages(template: ReportTemplateSnapshot, inputData: ReportPromptData): ChatMessage[] {
  const reportData = {
    period: {
      start: formatLocalDateTime(inputData.periodStart),
      endExclusive: formatLocalDateTime(inputData.periodEnd),
    },
    tasks: inputData.tasks.map(({ note: _note, ...task }) => task),
    notes: inputData.notes,
  };

  const userContent = `请严格按照以下结构化模板生成周报。所有时间均为本地时间，结束时间为排他边界。

<report_template>
${renderTemplate(template)}
</report_template>

<report_data>
\`\`\`json
${JSON.stringify(reportData, null, 2)}
\`\`\`
</report_data>`;

  return [
    { role: 'system', content: REPORT_SYSTEM_RULES },
    { role: 'user', content: userContent },
  ];
}

