// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNoteRepository,
  createReportRepository,
  createReportTemplateRepository,
  createTaskRepository,
  openDatabase,
  reportGenerateSchema,
  runMigrations,
  type MemexDatabase,
  type ReportCandidate,
  type TaskRepository,
} from '@memex/shared';
import type { AiConfigStore } from '../ai-config';
import { AiRequestError, type AiCompletionResult, type ChatMessage } from '../ai-client';
import { createReportService, type ReportServiceDependencies } from '../report-service';

let db: MemexDatabase;
let templates: ReturnType<typeof createReportTemplateRepository>;
let reports: ReturnType<typeof createReportRepository>;
let tasks: TaskRepository;
let notes: ReturnType<typeof createNoteRepository>;
let templateId: string;
let request: ReturnType<typeof vi.fn>;

const aiConfig: AiConfigStore = {
  getPublic: () => ({ baseUrl: 'https://api.example.com/v1', model: 'model-a', hasApiKey: true, timeoutMs: 90_000, revision: 'revision-1' }),
  save: () => ({ baseUrl: 'https://api.example.com/v1', model: 'model-a', hasApiKey: true, timeoutMs: 90_000, revision: 'revision-1' }),
  getCredentials: () => ({ baseUrl: 'https://api.example.com/v1', model: 'model-a', apiKey: 'secret', timeoutMs: 90_000 }),
  resolveConnectionConfig: () => ({ baseUrl: 'https://api.example.com/v1', model: 'model-a', apiKey: 'secret', timeoutMs: 90_000 }),
};

function createService(overrides: Partial<ReportServiceDependencies> = {}) {
  return createReportService({
    templates,
    reports,
    aiConfig,
    request: request as unknown as ReportServiceDependencies['request'],
    now: () => new Date(2026, 9, 22, 12, 0, 0).getTime(),
    ...overrides,
  });
}

function period() {
  return {
    periodStart: new Date(2026, 9, 19).getTime(),
    periodEnd: new Date(2026, 9, 26).getTime(),
    aiConfigRevision: 'revision-1',
  };
}

beforeEach(() => {
  // 任务是用 Date.now() 落库的，而本文件的时间范围写死为 2026-10-19 ~ 10-26。
  // 不固定系统时间的话，真实时间一旦越过 10-26，新建任务就落在范围外，
  // listCandidates 取不到，测试会以「任务数据已变化」失败。
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0, 0));
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-report-service-')), 'test.db'));
  runMigrations(db);
  templates = createReportTemplateRepository(db);
  reports = createReportRepository(db);
  tasks = createTaskRepository(db);
  notes = createNoteRepository(db);
  templateId = templates.list()[0]!.id;
  request = vi.fn(async () => ({ content: '# 本周完成\n\n- 完成周报模块' }) as AiCompletionResult);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('report service candidates', () => {
  it('rejects more than 1,000 candidates with a narrowing hint', () => {
    const candidate = {
      id: 'task',
      title: '任务',
      description: null,
      status: 'todo',
      priority: 'medium',
      dueAt: null,
      createdAt: 1,
      updatedAt: 1,
      completedAt: null,
      tags: [],
      noteId: null,
      noteTitle: null,
    } satisfies ReportCandidate;
    const service = createService({
      reports: { ...reports, listCandidates: () => Array.from({ length: 1001 }, () => candidate) },
    });

    expect(() => service.listCandidates(1, 2)).toThrow('缩小时间范围');
  });
});

describe('report service generation', () => {
  it('sends only selected tasks and saves a complete report snapshot', async () => {
    const first = tasks.create({ title: '第一项', tags: ['项目'] });
    const second = tasks.create({ title: '第二项' });
    tasks.create({ title: '未选择' });
    const service = createService();

    const report = await service.generate(
      { ...period(), templateId, taskIds: [first.id, second.id], includeNotes: false },
      new AbortController().signal,
    );

    expect(request).toHaveBeenCalledTimes(1);
    const messages = request.mock.calls[0]?.[1] as ChatMessage[];
    expect(messages[1]?.content).toContain('第一项');
    expect(messages[1]?.content).not.toContain('未选择');
    expect(report.tasks.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(report.title).toBe('2026-10-19 至 2026-10-25 周报');
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      model: 'model-a',
      apiKey: 'secret',
      timeoutMs: 90_000,
    });
    expect(report.notes).toEqual([]);
    expect(report.contentMarkdown).toContain('完成周报模块');
    expect(report.template.name).toBe('默认周报模板');
    expect(report.generationMeta).toMatchObject({
      model: 'model-a',
      baseUrl: 'https://api.example.com/v1',
      generatedAt: new Date(2026, 9, 22, 12, 0, 0).getTime(),
    });
    expect(reports.list()).toHaveLength(1);
  });

  it('rejects missing or deleted selected tasks before calling the model', async () => {
    const deleted = tasks.create({ title: '已删除' });
    tasks.softDelete(deleted.id);
    const service = createService();

    await expect(
      service.generate(
        { ...period(), templateId, taskIds: [deleted.id], includeNotes: false },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ message: '任务数据已变化，请重新加载' });
    expect(request).not.toHaveBeenCalled();
    expect(reports.list()).toEqual([]);
  });

  it('rejects selected tasks outside the requested period', async () => {
    const task = tasks.create({ title: '范围外任务' });
    const old = new Date(2026, 8, 1).getTime();
    db.prepare('UPDATE tasks SET created_at = ?, updated_at = ?, due_at = NULL, completed_at = NULL WHERE id = ?').run(
      old,
      old,
      task.id,
    );
    const service = createService();

    await expect(
      service.generate(
        { ...period(), templateId, taskIds: [task.id], includeNotes: false },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ message: '任务数据已变化，请重新加载' });
    expect(request).not.toHaveBeenCalled();
    expect(reports.list()).toEqual([]);
  });
  it('includes linked notes only when the option is enabled', async () => {
    const note = notes.create({ title: '关联笔记', contentJson: '{}', plainText: '关联笔记内容' });
    const task = tasks.create({ title: '带笔记任务', noteId: note.id });
    const service = createService();

    await service.generate(
      { ...period(), templateId, taskIds: [task.id], includeNotes: false },
      new AbortController().signal,
    );
    expect((request.mock.calls[0]?.[1] as ChatMessage[])[1]?.content).not.toContain('关联笔记内容');
    expect(reports.list()[0]?.noteCount).toBe(0);

    request.mockResolvedValue({ content: '# 含笔记周报' } as AiCompletionResult);
    const withNotes = await service.generate(
      { ...period(), templateId, taskIds: [task.id], includeNotes: true },
      new AbortController().signal,
    );
    expect((request.mock.calls[1]?.[1] as ChatMessage[])[1]?.content).toContain('关联笔记内容');
    expect(withNotes.notes[0]?.plainText).toBe('关联笔记内容');
    expect(withNotes.tasks[0]?.note?.plainText).toBe('关联笔记内容');
  });

  it('rejects individual notes over 20,000 characters', async () => {
    const note = notes.create({ contentJson: '{}', plainText: '长'.repeat(20_001) });
    const task = tasks.create({ title: '过长笔记', noteId: note.id });
    const service = createService();

    await expect(
      service.generate(
        { ...period(), templateId, taskIds: [task.id], includeNotes: true },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('20,000') });
    expect(request).not.toHaveBeenCalled();
    expect(reports.list()).toEqual([]);
  });

  it('rejects prompts and data over 120,000 characters without truncation', async () => {
    const task = tasks.create({ title: '超长上下文' });
    db.prepare('UPDATE tasks SET description = ? WHERE id = ?').run('x'.repeat(120_001), task.id);
    const service = createService();

    await expect(
      service.generate(
        { ...period(), templateId, taskIds: [task.id], includeNotes: false },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('120,000') });
    expect(request).not.toHaveBeenCalled();
    expect(reports.list()).toEqual([]);
  });

  it('rejects generation if the confirmed AI configuration changed', async () => {
    const task = tasks.create({ title: '配置变化' });
    const service = createService({
      aiConfig: {
        ...aiConfig,
        getPublic: () => ({ ...aiConfig.getPublic(), revision: 'revision-2' }),
      },
    });

    await expect(
      service.generate(
        { ...period(), templateId, taskIds: [task.id], includeNotes: false },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ message: 'AI 服务配置已变化，请重新确认' });
    expect(request).not.toHaveBeenCalled();
    expect(reports.list()).toEqual([]);
  });
  it('does not save a report for empty output, cancellation or AI failure', async () => {
    const task = tasks.create({ title: '失败场景' });
    const input = { ...period(), templateId, taskIds: [task.id], includeNotes: false };
    const service = createService();

    request.mockResolvedValueOnce({ content: '   ' } as AiCompletionResult);
    await expect(service.generate(input, new AbortController().signal)).rejects.toMatchObject({
      message: expect.stringContaining('内容为空'),
    });
    expect(reports.list()).toEqual([]);

    const controller = new AbortController();
    controller.abort();
    await expect(service.generate(input, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(reports.list()).toEqual([]);

    request.mockRejectedValueOnce(new AiRequestError('SERVER', '模型服务异常'));
    await expect(service.generate(input, new AbortController().signal)).rejects.toMatchObject({ code: 'SERVER' });
    expect(reports.list()).toEqual([]);
  });

  it('validates generation input with Zod', async () => {
    const service = createService();
    await expect(
      service.generate(
        { ...period(), templateId, taskIds: [], includeNotes: false },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(reportGenerateSchema.safeParse({ ...period(), templateId, taskIds: [], includeNotes: false }).success).toBe(
      false,
    );
  });
});
