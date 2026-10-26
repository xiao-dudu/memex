import { createNoteRepository, createSearchRepository, createTaskRepository } from '@memex/shared';
import type { MemexDatabase, Note, NoteSummary, Task, TaskPatch, TaskPriority, TaskStatus } from '@memex/shared';
import { normalizeText, textToDocument, toPlainText } from './documents.js';
import { McpToolError } from './errors.js';

/**
 * 兜底：due_at 可能是历史脏数据（超出 Date 可表示范围或为 NaN），
 * 此时 toISOString() 会抛 RangeError。返回 null 而不是让整个 list_tasks /
 * search_tasks 因为一行坏数据整体失败。
 */
function iso(value: number | null): string | null {
  if (value === null) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
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

/**
 * dueAt 允许 null（清除截止时间），所以不能直接复用不允许 null 的 parseDueBefore。
 */
function parseDueAt(value: string | number | null | undefined): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new McpToolError('INVALID_ARGUMENT', 'dueAt 必须是 ISO 8601 时间或毫秒时间戳');
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

export interface UpdateTaskArgs {
  id: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | number | null;
  tags?: string[];
}

/** changes 的固定顺序，与工具入参的展示顺序保持一致。 */
const TASK_CHANGE_ORDER: (keyof TaskPatch)[] = ['title', 'description', 'status', 'priority', 'dueAt', 'tags'];

export function updateTask(db: MemexDatabase, args: UpdateTaskArgs) {
  const repository = createTaskRepository(db);

  // TaskRepository.update 对不存在的任务只抛普通 Error（会被归类为 INTERNAL），
  // 且 get 不过滤软删除任务，所以先在这里把两种情况收敛成 NOT_FOUND。
  const existing = repository.get(args.id);
  if (!existing || existing.deletedAt !== null) {
    throw new McpToolError('NOT_FOUND', '任务不存在或已被删除');
  }

  const patch: TaskPatch = {};
  if (args.title !== undefined) patch.title = args.title;
  if (args.description !== undefined) patch.description = args.description;
  if (args.status !== undefined) patch.status = args.status;
  if (args.priority !== undefined) patch.priority = args.priority;
  if (args.dueAt !== undefined) patch.dueAt = parseDueAt(args.dueAt);
  if (args.tags !== undefined) patch.tags = args.tags;

  if (args.title !== undefined && args.title.trim() === '') {
    throw new McpToolError('INVALID_ARGUMENT', '任务标题不能为空');
  }
  if (Object.keys(patch).length === 0) {
    throw new McpToolError('INVALID_ARGUMENT', '至少需要提供一个要修改的字段');
  }

  const updated = repository.update(args.id, patch);
  return {
    task: serializeTask(updated),
    changes: TASK_CHANGE_ORDER.filter((field) => patch[field] !== undefined),
  };
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

export interface CreateTaskArgs {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | number | null;
  tags?: string[];
  noteId?: string | null;
}

export function createTask(db: MemexDatabase, args: CreateTaskArgs) {
  const title = args.title.trim();
  if (title === '') throw new McpToolError('INVALID_ARGUMENT', '任务标题不能为空');

  const noteId = args.noteId ?? null;
  if (noteId !== null) {
    // 外键约束报错信息对 AI 不可读，先在这里收敛成 NOT_FOUND。
    const note = createNoteRepository(db).get(noteId);
    if (!note || note.deletedAt !== null) throw new McpToolError('NOT_FOUND', `笔记不存在：${noteId}`);
  }

  const task = createTaskRepository(db).create({
    title,
    description: args.description ?? null,
    status: args.status,
    priority: args.priority,
    dueAt: parseDueAt(args.dueAt) ?? null,
    noteId,
    tags: args.tags,
  });
  return { task: serializeTask(task) };
}

export interface CreateNoteArgs {
  content: string;
  title?: string;
  tags?: string[];
  isPinned?: boolean;
}

export function createNote(db: MemexDatabase, args: CreateNoteArgs) {
  const text = normalizeText(args.content);
  if (text.trim() === '') throw new McpToolError('INVALID_ARGUMENT', '笔记正文不能为空');

  const contentJson = textToDocument(text);
  const note = createNoteRepository(db).create({
    contentJson,
    // 与 app 一致：plainText 用文档渲染结果，而不是原始 Markdown，
    // 否则摘要和全文搜索里会出现 `##`、`**` 这类标记。
    plainText: toPlainText(JSON.parse(contentJson)),
    title: args.title,
    isPinned: args.isPinned,
    tags: args.tags,
  });
  return { note: serializeNote(note) };
}
