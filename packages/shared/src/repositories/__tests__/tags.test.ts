import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createTagRepository, pruneOrphanTags, setEntityTags } from '../tags.js';
import { tagColor } from '../tag-color.js';

let db: MemexDatabase;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-tags-')), 'test.db'));
  runMigrations(db);
});

describe('tag repository', () => {
  it('produces stable colors', () => {
    expect(tagColor('工作')).toBe(tagColor('工作'));
    expect(tagColor('工作')).not.toBe(tagColor('生活'));
  });

  it('deduplicates tags by name', () => {
    const repo = createTagRepository(db);
    const first = repo.ensure('工作');
    const second = repo.ensure('工作');
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
  });

  it('removes join rows when a tag is deleted', () => {
    const repo = createTagRepository(db);
    const tag = repo.ensure('临时');
    const taskId = 'test-task';
    db.prepare('INSERT INTO tasks(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      taskId,
      '任务',
      Date.now(),
      Date.now(),
    );
    db.prepare('INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)').run(taskId, tag.id);
    repo.remove(tag.id);
    expect(db.prepare('SELECT count(*) AS count FROM task_tags').get()).toEqual({ count: 0 });
  });

  it('回收没有任何引用的标签', () => {
    const repo = createTagRepository(db);
    repo.ensure('工作');
    expect(repo.list()).toHaveLength(1);

    pruneOrphanTags(db);
    expect(repo.list()).toHaveLength(0);
  });

  it('保留仍被引用的标签', () => {
    const repo = createTagRepository(db);
    const taskId = 'task-keep';
    db.prepare('INSERT INTO tasks(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      taskId,
      '任务',
      Date.now(),
      Date.now(),
    );

    setEntityTags(db, 'task', taskId, ['工作', '临时']);
    pruneOrphanTags(db);
    expect(repo.list().map((tag) => tag.name).sort()).toEqual(['临时', '工作'].sort());
  });

  it('写入标签时自动回收失去引用的标签', () => {
    const repo = createTagRepository(db);
    const taskId = 'task-replace';
    db.prepare('INSERT INTO tasks(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      taskId,
      '任务',
      Date.now(),
      Date.now(),
    );

    setEntityTags(db, 'task', taskId, ['工作', '临时']);
    expect(repo.list().map((tag) => tag.name).sort()).toEqual(['临时', '工作'].sort());

    // 去掉「临时」这唯一的引用后，标签应随之消失，而不是留在列表里
    setEntityTags(db, 'task', taskId, ['工作']);
    expect(repo.list().map((tag) => tag.name)).toEqual(['工作']);
  });
});
