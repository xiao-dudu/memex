import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createSearchRepository } from '../search.js';
import { createTaskRepository } from '../tasks.js';
import { createNoteRepository } from '../notes.js';

let db: MemexDatabase;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-search-')), 'test.db'));
  runMigrations(db);
});

describe('unified search', () => {
  it('searches Chinese text across tasks and notes', () => {
    createTaskRepository(db).create({ title: '项目计划评审' });
    createNoteRepository(db).create({ contentJson: '{}', plainText: '项目计划细节记录' });

    const result = createSearchRepository(db).search('项目计划');
    expect(result.tasks[0]?.title).toBe('项目计划评审');
    expect(result.notes[0]?.title).toBe('项目计划细节记录');
  });

  it('falls back to LIKE for two-character queries', () => {
    createTaskRepository(db).create({ title: '计划会议' });
    const result = createSearchRepository(db).search('计划');
    expect(result.tasks).toHaveLength(1);
  });

  it('excludes deleted records', () => {
    const tasks = createTaskRepository(db);
    const task = tasks.create({ title: '已删除的项目计划' });
    tasks.softDelete(task.id);
    expect(createSearchRepository(db).search('项目计划').tasks).toHaveLength(0);
  });
});
