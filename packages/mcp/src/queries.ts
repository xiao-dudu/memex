import { createNoteRepository, createSearchRepository, createTaskRepository } from '@memex/shared';
import type { MemexDatabase, Note, NoteSummary, Task, TaskPriority, TaskStatus } from '@memex/shared';
import { McpToolError } from './errors.js';

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function serializeTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: iso(task.dueAt),
    noteId: task.noteId,
    noteTitle: task.noteTitle,
    tags: task.tags,
    createdAt: iso(task.createdAt),
    updatedAt: iso(task.updatedAt),
    completedAt: iso(task.completedAt),
  };
}

export function serializeNoteSummary(note: NoteSummary) {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.excerpt,
    tags: note.tags,
    isPinned: note.isPinned,
    createdAt: iso(note.createdAt),
    updatedAt: iso(note.updatedAt),
  };
}

export function serializeNote(note: Note) {
  let content: unknown = null;
  try {
    content = JSON.parse(note.contentJson);
  } catch {
    content = note.contentJson;
  }
  return {
    ...serializeNoteSummary(note),
    plainText: note.plainText,
    content,
  };
}

function parseDueBefore(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new McpToolError('INVALID_ARGUMENT', 'dueBefore 必须是 ISO 8601 时间或毫秒时间戳');
  return parsed;
}

export interface ListTasksArgs {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  dueBefore?: string | number;
  limit: number;
}

export function listTasks(db: MemexDatabase, args: ListTasksArgs) {
  const repository = createTaskRepository(db);
  const view = args.status === 'done' ? 'done' : 'inbox';
  const dueBefore = parseDueBefore(args.dueBefore);
  const tasks = repository
    .list({
      view,
      status: args.status,
      priority: args.priority,
      tag: args.tag,
      limit: 100,
    })
    .filter((task) => dueBefore === undefined || (task.dueAt !== null && task.dueAt <= dueBefore))
    .slice(0, args.limit);
  return tasks.map(serializeTask);
}

export function searchTasks(db: MemexDatabase, query: string, limit: number) {
  return createSearchRepository(db)
    .search(query, limit)
    .tasks.map(serializeTask);
}

export function getTask(db: MemexDatabase, id: string) {
  const task = createTaskRepository(db).get(id);
  if (!task || task.deletedAt !== null) throw new McpToolError('NOT_FOUND', `任务不存在：${id}`);
  return serializeTask(task);
}

export interface ListNotesArgs {
  tag?: string;
  limit: number;
}

export function listNotes(db: MemexDatabase, args: ListNotesArgs) {
  return createNoteRepository(db)
    .list({ view: 'all', tag: args.tag, limit: args.limit })
    .map(serializeNoteSummary);
}

export function searchNotes(db: MemexDatabase, query: string, limit: number) {
  return createSearchRepository(db)
    .search(query, limit)
    .notes.map(serializeNoteSummary);
}

export function getNote(db: MemexDatabase, id: string) {
  const note = createNoteRepository(db).get(id);
  if (!note || note.deletedAt !== null) throw new McpToolError('NOT_FOUND', `笔记不存在：${id}`);
  return serializeNote(note);
}
