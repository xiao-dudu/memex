import type { ExportBundle } from './types.js';
import { LATEST_SCHEMA_VERSION } from './db/migrate.js';
import type { MemexDatabase } from './db/database.js';

export function exportAll(db: MemexDatabase, now = new Date()): ExportBundle {
  return {
    schemaVersion: LATEST_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    tasks: db.prepare('SELECT * FROM tasks ORDER BY created_at').all(),
    notes: db.prepare('SELECT * FROM notes ORDER BY created_at').all(),
    tags: db.prepare('SELECT * FROM tags ORDER BY name').all(),
    taskTags: db.prepare('SELECT * FROM task_tags').all(),
    noteTags: db.prepare('SELECT * FROM note_tags').all(),
  };
}

export function purgeExpiredTrash(db: MemexDatabase, now = Date.now(), days = 30): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const tasks = db.prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
  const notes = db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
  return Number(tasks.changes) + Number(notes.changes);
}
