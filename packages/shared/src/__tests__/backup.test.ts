import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/open.js';
import { runMigrations } from '../db/migrate.js';
import { backupDatabase, listBackups, pruneBackups } from '../backup.js';
import type { MemexDatabase } from '../db/database.js';

let db: MemexDatabase;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'memex-backup-'));
  db = openDatabase(join(root, 'memex.db'));
  runMigrations(db);
});

describe('backup', () => {
  it('creates a readable snapshot and prunes old copies', async () => {
    const backupDir = join(root, 'backups');
    const first = await backupDatabase(db, backupDir, new Date('2026-10-18T10:00:00'));
    expect(existsSync(first)).toBe(true);
    const copy = openDatabase(first, { readonly: true });
    expect(copy.prepare("SELECT name FROM sqlite_master WHERE name = 'tasks'").get()).toBeTruthy();
    copy.close();

    for (let index = 0; index < 8; index += 1) {
      writeFileSync(join(backupDir, `memex-2026101${index}-000000.db`), 'placeholder');
    }
    expect(listBackups(backupDir).length).toBeGreaterThanOrEqual(9);
    pruneBackups(backupDir, 7);
    expect(listBackups(backupDir)).toHaveLength(7);
  });
});
