import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTaskRepository,
  openDatabase,
  runMigrations,
  type MemexDatabase,
} from '@memex/shared';
import { readTaskWriteAccess, withWritableDatabase } from '../access.js';

let db: MemexDatabase;
let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), 'memex-mcp-')), 'test.db');
  db = openDatabase(dbPath);
  runMigrations(db);
});

describe('withWritableDatabase', () => {
  it('可写连接能真正落库', () => {
    const created = createTaskRepository(db).create({ title: '原始标题' }).id;
    withWritableDatabase(dbPath, (handle) => {
      createTaskRepository(handle).update(created, { title: '改过的标题' });
    });
    expect(createTaskRepository(db).get(created)?.title).toBe('改过的标题');
  });

  it('写冲突映射为 DB_LOCKED', { timeout: 15000 }, () => {
    db.exec('BEGIN IMMEDIATE');
    try {
      expect(() => withWritableDatabase(dbPath, (handle) => {
        createTaskRepository(handle).create({ title: '冲突' });
      })).toThrow(expect.objectContaining({ code: 'DB_LOCKED' }));
    } finally {
      db.exec('ROLLBACK');
    }
  });
});

describe('readTaskWriteAccess', () => {
  it('默认读不到写入权限', () => {
    expect(readTaskWriteAccess(db)).toBe(false);
  });

  it('设置开启后读到写入权限', () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    expect(readTaskWriteAccess(db)).toBe(true);
  });
});
