import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/open.js';
import { runMigrations } from '../db/migrate.js';
import { exportAll, purgeExpiredTrash } from '../export.js';
import { createTaskRepository } from '../repositories/tasks.js';
import { createNoteRepository } from '../repositories/notes.js';
import { createReportTemplateRepository } from '../repositories/report-templates.js';
import { createReportRepository } from '../repositories/reports.js';
import type { MemexDatabase } from '../db/database.js';

let db: MemexDatabase;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-export-')), 'memex.db'));
  runMigrations(db);
});

describe('export', () => {
  it('includes all tables and a schema version', () => {
    createTaskRepository(db).create({ title: '导出任务', tags: ['工作'] });
    createNoteRepository(db).create({ contentJson: '{}', plainText: '导出笔记' });
    const bundle = exportAll(db, new Date('2026-10-20T00:00:00Z'));
    expect(bundle.schemaVersion).toBe(3);
    expect(bundle.exportedAt).toBe('2026-10-20T00:00:00.000Z');
    expect(bundle.tasks).toHaveLength(1);
    expect(bundle.notes).toHaveLength(1);
    expect(bundle.tags).toHaveLength(1);
    expect(bundle.reportTemplates).toHaveLength(1);
    expect(bundle.reports).toHaveLength(0);
  });

  it('exports persisted report rows', () => {
    createReportRepository(db).create({
      title: '导出周报',
      periodStart: 1,
      periodEnd: 2,
      templateId: null,
      template: {
        name: '模板',
        description: null,
        basePrompt: '总结',
        sections: [{ id: 'a', title: 'A', instruction: '', allowEmpty: true }],
        constraints: '',
      },
      tasks: [],
      notes: [],
      contentMarkdown: '# 周报',
      generationMeta: {
        model: 'model-a',
        baseUrl: 'https://api.example.com/v1',
        generatedAt: 1,
        durationMs: 1,
        promptChars: 1,
      },
    });

    const bundle = exportAll(db, new Date('2026-10-22T00:00:00Z'));
    expect(bundle.reports).toHaveLength(1);
    expect(bundle.reports[0]).toEqual(expect.objectContaining({ title: '导出周报' }));
  });
  it('exports report templates without settings or credentials', () => {
    createReportTemplateRepository(db).create({
      name: '周报模板',
      basePrompt: 'x',
      sections: [{ id: 'a', title: 'A', instruction: '', allowEmpty: true }],
    });
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('ai_api_key_encrypted', 'ciphertext')").run();

    const bundle = exportAll(db, new Date('2026-10-22T00:00:00Z'));
    expect(bundle.schemaVersion).toBe(3);
    expect(bundle.reportTemplates).toHaveLength(2);
    expect(bundle.reports).toHaveLength(0);
    expect(JSON.stringify(bundle)).not.toContain('ai_api_key_encrypted');
    expect(JSON.stringify(bundle)).not.toContain('ciphertext');
  });
});

describe('trash retention', () => {
  it('purges entries deleted more than 30 days ago', () => {
    const tasks = createTaskRepository(db);
    const old = tasks.create({ title: '旧任务' });
    const fresh = tasks.create({ title: '新任务' });
    tasks.softDelete(old.id);
    tasks.softDelete(fresh.id);
    const now = Date.now();
    db.prepare('UPDATE tasks SET deleted_at = ? WHERE id = ?').run(now - 31 * 86_400_000, old.id);

    expect(purgeExpiredTrash(db, now, 30)).toBe(1);
    expect(tasks.get(old.id)).toBeNull();
    expect(tasks.get(fresh.id)).not.toBeNull();
  });
});
