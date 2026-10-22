import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import type { ReportNoteSnapshot, ReportTemplateSnapshot } from '../../reports/types.js';
import { createNoteRepository } from '../notes.js';
import { createReportRepository, type ReportRepository } from '../reports.js';
import { createTaskRepository } from '../tasks.js';

let db: MemexDatabase;
let repo: ReportRepository;

const DAY = 86_400_000;
const start = Date.UTC(2026, 9, 19);
const end = start + 7 * DAY;

const template: ReportTemplateSnapshot = {
  name: '默认周报模板',
  description: null,
  basePrompt: '总结本周工作',
  sections: [{ id: 'done', title: '本周完成', instruction: '总结结果', allowEmpty: false }],
  constraints: '不要编造',
};

const generationMeta = {
  model: 'mock-model',
  baseUrl: 'http://localhost:1234/v1',
  generatedAt: start + DAY,
  durationMs: 100,
  promptChars: 200,
};

function setTimes(
  id: string,
  times: Partial<{ createdAt: number; dueAt: number | null; completedAt: number | null; updatedAt: number }>,
): void {
  db.prepare('UPDATE tasks SET created_at = ?, due_at = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
    times.createdAt ?? start - DAY,
    times.dueAt ?? null,
    times.completedAt ?? null,
    times.updatedAt ?? start - DAY,
    id,
  );
}

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-reports-')), 'test.db'));
  runMigrations(db);
  repo = createReportRepository(db);
});

describe('report repository candidates', () => {
  it('finds tasks by any activity time and excludes deleted tasks', () => {
    const tasks = createTaskRepository(db);
    const byCreated = tasks.create({ title: 'created', tags: ['项目'] });
    const byDue = tasks.create({ title: 'due' });
    const byCompleted = tasks.create({ title: 'completed', status: 'done' });
    const byUpdated = tasks.create({ title: 'updated' });
    const deleted = tasks.create({ title: 'deleted' });

    setTimes(byCreated.id, { createdAt: start + 1, updatedAt: start - 1 });
    setTimes(byDue.id, { dueAt: start + 2, updatedAt: start - 1 });
    setTimes(byCompleted.id, { completedAt: start + 3, updatedAt: start - 1 });
    setTimes(byUpdated.id, { updatedAt: start + 4 });
    setTimes(deleted.id, { createdAt: start + 5 });
    tasks.softDelete(deleted.id);

    const candidates = repo.listCandidates(start, end);
    const ids = candidates.map((item) => item.id);
    expect(ids).toContain(byCreated.id);
    expect(ids).toContain(byDue.id);
    expect(ids).toContain(byCompleted.id);
    expect(ids).toContain(byUpdated.id);
    expect(ids).not.toContain(deleted.id);
    expect(candidates[0]?.status).toBe('done');
    expect(candidates.find((item) => item.id === byCreated.id)?.tags).toEqual(['项目']);
  });

  it('uses start-inclusive and end-exclusive boundaries', () => {
    const tasks = createTaskRepository(db);
    const atStart = tasks.create({ title: 'start' });
    const atEnd = tasks.create({ title: 'end' });
    setTimes(atStart.id, { createdAt: start });
    setTimes(atEnd.id, { createdAt: end });

    expect(repo.listCandidates(start, end).map((item) => item.id)).toEqual([atStart.id]);
    expect(() => repo.listCandidates(end, start)).toThrow();
  });

  it('returns selected tasks in input order and resolves their note titles', () => {
    const notes = createNoteRepository(db);
    const tasks = createTaskRepository(db);
    const firstNote = notes.create({ contentJson: '{}', plainText: '第一条笔记' });
    const secondNote = notes.create({ contentJson: '{}', plainText: '第二条笔记' });
    const first = tasks.create({ title: '第一', noteId: firstNote.id });
    const second = tasks.create({ title: '第二', noteId: secondNote.id, tags: ['重点'] });
    const deleted = tasks.create({ title: '删除' });
    tasks.softDelete(deleted.id);

    const selected = repo.getSelectedTasks([second.id, deleted.id, first.id, second.id]);
    expect(selected.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(selected[0]?.noteTitle).toBe('第二条笔记');
    expect(selected[0]?.tags).toEqual(['重点']);
  });

  it('returns only linked non-deleted notes once in task order', () => {
    const notes = createNoteRepository(db);
    const tasks = createTaskRepository(db);
    const firstNote = notes.create({ contentJson: '{}', plainText: '第一条笔记' });
    const secondNote = notes.create({ contentJson: '{}', plainText: '第二条笔记' });
    const first = tasks.create({ title: '第一', noteId: firstNote.id });
    const second = tasks.create({ title: '第二', noteId: secondNote.id });
    const third = tasks.create({ title: '第三', noteId: firstNote.id });

    expect(repo.getLinkedNotes([second.id, first.id, third.id])).toEqual([
      { id: secondNote.id, title: secondNote.title, plainText: '第二条笔记' },
      { id: firstNote.id, title: firstNote.title, plainText: '第一条笔记' },
    ]);

    notes.softDelete(firstNote.id);
    expect(repo.getLinkedNotes([second.id, first.id])).toEqual([
      { id: secondNote.id, title: secondNote.title, plainText: '第二条笔记' },
    ]);
  });
});

describe('report repository persistence', () => {
  it('keeps task and template snapshots after source data changes', () => {
    const notes = createNoteRepository(db);
    const tasks = createTaskRepository(db);
    const note = notes.create({ contentJson: '{}', plainText: '原始笔记' });
    const task = tasks.create({ title: '原始标题', noteId: note.id, tags: ['原始标签'] });
    const selected = repo.getSelectedTasks([task.id])[0]!;
    const linkedNotes: ReportNoteSnapshot[] = repo.getLinkedNotes([task.id]);

    const created = repo.create({
      title: '本周周报',
      periodStart: start,
      periodEnd: end,
      templateId: '00000000-0000-4000-8000-000000000001',
      template,
      tasks: [{ ...selected, note: linkedNotes[0] }],
      notes: linkedNotes,
      contentMarkdown: '# 本周周报',
      generationMeta,
    });

    tasks.update(task.id, { title: '新标题', tags: ['新标签'] });
    notes.update(note.id, { title: '新笔记标题', plainText: '新笔记内容' });

    const stored = repo.get(created.id)!;
    expect(stored.tasks[0]?.title).toBe('原始标题');
    expect(stored.tasks[0]?.tags).toEqual(['原始标签']);
    expect(stored.tasks[0]?.note?.plainText).toBe('原始笔记');
    expect(stored.template.name).toBe('默认周报模板');
  });

  it('lists summaries from snapshot arrays and updates only editable fields', () => {
    const tasks = createTaskRepository(db);
    const task = tasks.create({ title: '任务' });
    const selected = repo.getSelectedTasks([task.id])[0]!;
    const created = repo.create({
      title: '周报标题',
      periodStart: start,
      periodEnd: end,
      templateId: null,
      template,
      tasks: [selected],
      notes: [],
      contentMarkdown: '# 原文',
      generationMeta,
    });

    expect(repo.list()).toEqual([
      expect.objectContaining({
        id: created.id,
        title: '周报标题',
        templateName: '默认周报模板',
        taskCount: 1,
        noteCount: 0,
      }),
    ]);

    const updated = repo.update(created.id, { title: '编辑标题', contentMarkdown: '# 编辑后' });
    expect(updated.title).toBe('编辑标题');
    expect(updated.contentMarkdown).toBe('# 编辑后');
    expect(updated.tasks).toEqual(created.tasks);
    expect(updated.generationMeta).toEqual(generationMeta);
    expect(() => repo.update(created.id, {})).toThrow();
    expect(() => repo.update('00000000-0000-4000-8000-000000000099', { title: '不存在' })).toThrow('报告不存在');
  });

  it('hard-deletes reports', () => {
    const created = repo.create({
      title: '待删除',
      periodStart: start,
      periodEnd: end,
      templateId: null,
      template,
      tasks: [],
      notes: [],
      contentMarkdown: '# 待删除',
      generationMeta,
    });
    repo.remove(created.id);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.list()).toEqual([]);
    expect(() => repo.remove(created.id)).toThrow('报告不存在');
  });
});
