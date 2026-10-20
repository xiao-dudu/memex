import type { MemexDatabase } from '../db/database.js';
import type { NoteSummary, SearchResults, Task } from '../types.js';
import { createNoteRepository } from './notes.js';
import { createTaskRepository } from './tasks.js';

function likeTerm(query: string): string {
  return `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`;
}

function ftsPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

export interface SearchRepository {
  search(query: string, limit?: number): SearchResults;
}

export function createSearchRepository(db: MemexDatabase): SearchRepository {
  const tasks = createTaskRepository(db);
  const notes = createNoteRepository(db);

  return {
    search(query, limit = 20) {
      const clean = query.trim();
      const max = Math.min(Math.max(limit, 1), 100);
      if (!clean) return { tasks: [], notes: [] };

      let taskIds: string[];
      let noteIds: string[];

      if (clean.length >= 3) {
        try {
          taskIds = (db
            .prepare('SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH ? LIMIT ?')
            .all(ftsPhrase(clean), max) as { task_id: string }[]).map((row) => row.task_id);
          noteIds = (db
            .prepare('SELECT note_id FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?')
            .all(ftsPhrase(clean), max) as { note_id: string }[]).map((row) => row.note_id);
        } catch {
          taskIds = [];
          noteIds = [];
        }
      } else {
        const like = likeTerm(clean);
        taskIds = (db
          .prepare("SELECT id AS task_id FROM tasks WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR coalesce(description, '') LIKE ? ESCAPE '\\') LIMIT ?")
          .all(like, like, max) as { task_id: string }[]).map((row) => row.task_id);
        noteIds = (db
          .prepare("SELECT id AS note_id FROM notes WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR plain_text LIKE ? ESCAPE '\\') LIMIT ?")
          .all(like, like, max) as { note_id: string }[]).map((row) => row.note_id);
      }

      const foundTasks = taskIds
        .map((id) => tasks.get(id))
        .filter((task): task is Task => task !== null && task.deletedAt === null);
      const foundNotes = noteIds
        .map((id) => notes.get(id))
        .filter((note): note is NonNullable<typeof note> => note !== null && note.deletedAt === null)
        .map(({ contentJson: _contentJson, plainText: _plainText, ...summary }) => summary as NoteSummary);

      return { tasks: foundTasks, notes: foundNotes };
    },
  };
}
