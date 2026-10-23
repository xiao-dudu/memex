import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createSettingsRepository } from '../settings.js';

let db: MemexDatabase;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-settings-')), 'test.db'));
  runMigrations(db);
});

describe('settings repository', () => {
  it('默认关闭任务写入', () => {
    expect(createSettingsRepository(db).get().mcpTaskWrite).toBe(false);
  });

  it('持久化并读回开启状态', () => {
    const repo = createSettingsRepository(db);
    repo.update({ mcpTaskWrite: true });
    expect(repo.get().mcpTaskWrite).toBe(true);
  });

  it('关闭状态可被写回', () => {
    const repo = createSettingsRepository(db);
    repo.update({ mcpTaskWrite: true });
    repo.update({ mcpTaskWrite: false });
    expect(repo.get().mcpTaskWrite).toBe(false);
  });

  it('settings 键损坏时保留默认值', () => {
    db.prepare("INSERT INTO settings(key, value) VALUES ('mcp_task_write', 'not-json')").run();
    expect(createSettingsRepository(db).get().mcpTaskWrite).toBe(false);
  });
});
