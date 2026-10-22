import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../open.js';
import { MIGRATIONS, runMigrations } from '../migrate.js';

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

  it('upgrades a populated version 1 database without losing data', () => {
    const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-migrate-v1-')), 'test.db'));
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    db.exec(MIGRATIONS[0]!.sql);
    db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)').run(Date.now());
    db.prepare('INSERT INTO tasks(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'legacy-task',
      '旧任务',
      1,
      1,
    );

    expect(runMigrations(db)).toBe(1);
    expect(db.prepare('SELECT title FROM tasks WHERE id = ?').get('legacy-task')).toEqual({ title: '旧任务' });
    expect(db.prepare('SELECT count(*) AS count FROM report_templates').get()).toEqual({ count: 1 });
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
