import type { MemexDatabase } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import type { Task, TaskCounts, TaskFilter, TaskInput, TaskPatch, TaskPriority, TaskStatus, TaskView } from '../types.js';
import { pruneOrphanTags, setEntityTags, getEntityTags } from './tags.js';
import { futureRange, getDayRange } from './time.js';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  description_json: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: number | null;
  note_id: string | null;
  note_title: string | null;
  note_deleted_at: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  deleted_at: number | null;
}

const PRIORITY_ORDER = `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

function mapTask(row: TaskRow, tags: string[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    descriptionJson: row.description_json,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    noteId: row.note_id,
    noteTitle: row.note_title,
    noteInTrash: row.note_deleted_at !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    tags,
  };
}

function orderFor(view: TaskView): string {
  if (view === 'done') return `t.completed_at DESC, t.updated_at DESC`;
  if (view === 'trash') return `t.deleted_at DESC`;
  return `CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, ${PRIORITY_ORDER}, t.created_at DESC`;
}

export interface TaskRepository {
  list(filter?: TaskFilter): Task[];
  get(id: string): Task | null;
  create(input: TaskInput): Task;
  update(id: string, patch: TaskPatch): Task;
  softDelete(id: string): void;
  restore(id: string): void;
  purge(id: string): void;
  setTags(id: string, names: string[]): void;
  counts(): TaskCounts;
}

export function createTaskRepository(db: MemexDatabase): TaskRepository {
  const hydrate = (rows: TaskRow[]): Task[] => {
    const tagMap = getEntityTags(db, 'task', rows.map((row) => row.id));
    return rows.map((row) => mapTask(row, tagMap.get(row.id) ?? []));
  };

  return {
    list(filter = {}) {
      const view = filter.view ?? 'inbox';
      const where: string[] = [];
      const params: (string | number | null)[] = [];

      if (view === 'trash') {
        where.push('t.deleted_at IS NOT NULL');
      } else {
        where.push('t.deleted_at IS NULL');
      }

      if (view === 'inbox') {
        where.push("t.status <> 'done'");
      } else if (view === 'done') {
        where.push("t.status = 'done'");
      } else if (view === 'today') {
        const { end } = getDayRange();
        where.push("t.status <> 'done'", 't.due_at IS NOT NULL', 't.due_at < ?');
        params.push(end);
      } else if (view === 'upcoming') {
        const range = futureRange(7);
        where.push("t.status <> 'done'", 't.due_at IS NOT NULL', 't.due_at >= ?', 't.due_at < ?');
        params.push(range.start, range.end);
      }

      if (filter.status) {
        where.push('t.status = ?');
        params.push(filter.status);
      }
      if (filter.priority) {
        where.push('t.priority = ?');
        params.push(filter.priority);
      }
      if (filter.tag) {
        where.push('EXISTS (SELECT 1 FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = t.id AND tg.name = ?)');
        params.push(filter.tag);
      }
      if (filter.query?.trim()) {
        where.push('(t.title LIKE ? OR coalesce(t.description, \'\') LIKE ?)');
        const like = `%${filter.query.trim()}%`;
        params.push(like, like);
      }

      const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
      const offset = Math.max(filter.offset ?? 0, 0);
      const rows = db
        .prepare(`
          SELECT t.*, n.title AS note_title, n.deleted_at AS note_deleted_at
          FROM tasks t
          LEFT JOIN notes n ON n.id = t.note_id
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderFor(view)}
          LIMIT ? OFFSET ?
        `)
        .all(...params, limit, offset) as unknown as TaskRow[];
      return hydrate(rows);
    },

    get(id) {
      const row = db
        .prepare(`
          SELECT t.*, n.title AS note_title, n.deleted_at AS note_deleted_at
          FROM tasks t
          LEFT JOIN notes n ON n.id = t.note_id
          WHERE t.id = ?
        `)
        .get(id) as unknown as TaskRow | undefined;
      if (!row) return null;
      return hydrate([row])[0] ?? null;
    },

    create(input) {
      const id = randomUUID();
      const now = Date.now();
      const status = input.status ?? 'todo';
      const insert = db.transaction(() => {
        db.prepare(`
          INSERT INTO tasks(id, title, description, description_json, status, priority, due_at, note_id, created_at, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.title.trim(),
          input.description?.trim() || null,
          input.descriptionJson ?? null,
          status,
          input.priority ?? 'medium',
          input.dueAt ?? null,
          input.noteId ?? null,
          now,
          now,
          status === 'done' ? now : null,
        );
        if (input.tags?.length) setEntityTags(db, 'task', id, input.tags);
      });
      insert();
      return this.get(id)!;
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) throw new Error('任务不存在');
      const now = Date.now();
      const assignments: string[] = [];
      const params: (string | number | null)[] = [];

      const assign = (column: string, value: string | number | null) => {
        assignments.push(`${column} = ?`);
        params.push(value);
      };

      if (patch.title !== undefined) assign('title', patch.title.trim());
      if (patch.description !== undefined) assign('description', patch.description?.trim() || null);
      if (patch.descriptionJson !== undefined) assign('description_json', patch.descriptionJson);
      if (patch.status !== undefined) {
        assign('status', patch.status);
        if (patch.status === 'done' && existing.status !== 'done') assign('completed_at', now);
        if (patch.status !== 'done' && existing.status === 'done') assign('completed_at', null);
      }
      if (patch.priority !== undefined) assign('priority', patch.priority);
      if (patch.dueAt !== undefined) assign('due_at', patch.dueAt);
      if (patch.noteId !== undefined) assign('note_id', patch.noteId);
      assign('updated_at', now);

      const apply = db.transaction(() => {
        db.prepare(`UPDATE tasks SET ${assignments.join(', ')} WHERE id = ?`).run(...params, id);
        if (patch.tags !== undefined) setEntityTags(db, 'task', id, patch.tags);
      });
      apply();
      return this.get(id)!;
    },

    softDelete(id) {
      const now = Date.now();
      db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    },

    restore(id) {
      db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), id);
    },

    purge(id) {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      pruneOrphanTags(db);
    },

    setTags(id, names) {
      setEntityTags(db, 'task', id, names);
    },

    counts() {
      const { end } = getDayRange();
      const upcoming = futureRange(7);
      const row = db
        .prepare(`
          SELECT
            sum(CASE WHEN deleted_at IS NULL AND status <> 'done' THEN 1 ELSE 0 END) AS inbox,
            sum(CASE WHEN deleted_at IS NULL AND status <> 'done' AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END) AS today,
            sum(CASE WHEN deleted_at IS NULL AND status <> 'done' AND due_at IS NOT NULL AND due_at >= ? AND due_at < ? THEN 1 ELSE 0 END) AS upcoming,
            sum(CASE WHEN deleted_at IS NULL AND status = 'done' THEN 1 ELSE 0 END) AS done,
            sum(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trash
          FROM tasks
        `)
        .get(end, upcoming.start, upcoming.end) as Record<keyof TaskCounts, number | null>;

      return {
        inbox: row.inbox ?? 0,
        today: row.today ?? 0,
        upcoming: row.upcoming ?? 0,
        done: row.done ?? 0,
        trash: row.trash ?? 0,
      };
    },
  };
}
