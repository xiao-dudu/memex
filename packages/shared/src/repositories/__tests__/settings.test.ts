import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createSettingsRepository } from '../settings.js';

let db: MemexDatabase;
let dbDir: string;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-settings-'));
  db = openDatabase(join(dbDir, 'test.db'));
  runMigrations(db);
});

afterEach(() => {
  db.close();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('settings repository', () => {
  it('默认关闭任务写入', () => {
    expect(createSettingsRepository(db).get().mcpTaskWrite).toBe(false);
  });

  it('持久化并读回开启状态', () => {
    const repo = createSettingsRepository(db);
    const result = repo.update({ mcpTaskWrite: true });
    expect(result.mcpTaskWrite).toBe(true);
    expect(repo.get().mcpTaskWrite).toBe(true);
  });

  it('关闭状态可被写回', () => {
    const repo = createSettingsRepository(db);
    repo.update({ mcpTaskWrite: true });
    const result = repo.update({ mcpTaskWrite: false });
    expect(result.mcpTaskWrite).toBe(false);
    expect(repo.get().mcpTaskWrite).toBe(false);
  });

  it('settings 键损坏时保留默认值', () => {
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('mcp_task_write', 'not-json')").run();
    expect(createSettingsRepository(db).get().mcpTaskWrite).toBe(false);
  });
});
