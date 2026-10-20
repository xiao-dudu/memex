import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../open.js';
import { runMigrations } from '../migrate.js';

describe('migrations', () => {
  it('creates tables, FTS indexes and applies only once', () => {
    const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-')), 'test.db'));
    expect(runMigrations(db)).toBe(1);
    expect(runMigrations(db)).toBe(0);

    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['tasks', 'notes', 'tags', 'task_tags', 'note_tags', 'settings', 'tasks_fts', 'notes_fts']),
    );
    db.close();
  });
});
