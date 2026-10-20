import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createTaskRepository } from '../tasks.js';

let db: MemexDatabase;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-tasks-')), 'test.db'));
  runMigrations(db);
});

describe('task repository', () => {
  it('orders tasks by due date then priority', () => {
    const repo = createTaskRepository(db);
    repo.create({ title: '无截止', priority: 'high' });
    repo.create({ title: '稍后', priority: 'low', dueAt: Date.now() + 86_400_000 });
    repo.create({ title: '更早', priority: 'low', dueAt: Date.now() + 3_600_000 });

    expect(repo.list({ view: 'inbox' }).map((task) => task.title)).toEqual(['更早', '稍后', '无截止']);
  });

  it('soft deletes, lists in trash and restores', () => {
    const repo = createTaskRepository(db);
    const task = repo.create({ title: '回收站测试' });
    repo.softDelete(task.id);

    expect(repo.list({ view: 'inbox' })).toHaveLength(0);
    expect(repo.list({ view: 'trash' }).map((item) => item.id)).toEqual([task.id]);
    expect(repo.counts().trash).toBe(1);

    repo.restore(task.id);
    expect(repo.list({ view: 'inbox' })).toHaveLength(1);
  });

  it('sets completedAt when moving to done', () => {
    const repo = createTaskRepository(db);
    const task = repo.create({ title: '完成我' });
    const done = repo.update(task.id, { status: 'done' });
    expect(done.completedAt).not.toBeNull();
    const reopened = repo.update(task.id, { status: 'todo' });
    expect(reopened.completedAt).toBeNull();
  });

  it('assigns and returns tags', () => {
    const repo = createTaskRepository(db);
    const task = repo.create({ title: '带标签', tags: ['工作', '重要'] });
    expect(repo.get(task.id)?.tags).toEqual(['工作', '重要']);
  });

  it('uses overdue tasks in the today view', () => {
    const repo = createTaskRepository(db);
    repo.create({ title: '逾期', dueAt: Date.now() - 86_400_000 });
    repo.create({ title: '明天', dueAt: Date.now() + 86_400_000 });
    expect(repo.list({ view: 'today' }).map((task) => task.title)).toEqual(['逾期']);
  });
});
