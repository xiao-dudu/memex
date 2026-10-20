import type { MemexDatabase } from './database.js';

export const LATEST_SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  sql: string;
}

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '无标题',
  content_json TEXT NOT NULL DEFAULT '{}',
  plain_text TEXT NOT NULL DEFAULT '',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_at INTEGER,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(deleted_at, status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_note ON tasks(note_id);
CREATE INDEX IF NOT EXISTS idx_notes_active ON notes(deleted_at, is_pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  task_id UNINDEXED,
  title,
  description,
  tokenize = 'trigram'
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  plain_text,
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(task_id, title, description)
  VALUES (new.id, new.title, coalesce(new.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks BEGIN
  DELETE FROM tasks_fts WHERE task_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  DELETE FROM tasks_fts WHERE task_id = old.id;
  INSERT INTO tasks_fts(task_id, title, description)
  VALUES (new.id, new.title, coalesce(new.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(note_id, title, plain_text)
  VALUES (new.id, new.title, new.plain_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
  DELETE FROM notes_fts WHERE note_id = old.id;
  INSERT INTO notes_fts(note_id, title, plain_text)
  VALUES (new.id, new.title, new.plain_text);
END;

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('mcp_access_mode', '"tasks"'),
  ('close_to_tray', 'true'),
  ('auto_launch', 'false'),
  ('quick_capture_hide_on_blur', 'true'),
  ('theme', '"system"'),
  ('last_backup_at', '0');
`;

export const MIGRATIONS: Migration[] = [{ version: 1, sql: MIGRATION_1 }];

export function getSchemaVersion(db: MemexDatabase): number {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name: string } | undefined;
  if (!exists) return 0;
  const row = db.prepare('SELECT coalesce(max(version), 0) AS version FROM schema_migrations').get() as { version: number };
  return row.version;
}

export function runMigrations(db: MemexDatabase): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((row) => row.version),
  );

  let appliedCount = 0;
  const apply = db.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(migration.version, Date.now());
      appliedCount += 1;
    }
  });
  apply();
  return appliedCount;
}
