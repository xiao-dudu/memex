import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../open.js';
import { runMigrations } from '../migrate.js';

describe('migrations', () => {
  it('creates tables, FTS indexes and applies only once', () => {
    const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-')), 'test.db'));
    expect(runMigrations(db)).toBe(2);
    expect(runMigrations(db)).toBe(0);

    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['tasks', 'notes', 'tags', 'task_tags', 'note_tags', 'settings', 'tasks_fts', 'notes_fts']),
    );
    db.close();
  });

  it('creates report tables and a built-in template', () => {
    const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-report-')), 'test.db'));
    expect(runMigrations(db)).toBe(2);
    expect(runMigrations(db)).toBe(0);

    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(names).toEqual(expect.arrayContaining(['report_templates', 'reports']));

    const builtin = db.prepare('SELECT name, is_builtin FROM report_templates WHERE is_builtin = 1').get() as {
      name: string;
      is_builtin: number;
    };
    expect(builtin.name).toBe('默认周报模板');
    expect(builtin.is_builtin).toBe(1);
    db.close();
  });
});
