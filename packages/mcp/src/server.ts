import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readAccessMode, readNoteWriteAccess, readTaskWriteAccess, withDatabase, withWritableDatabase } from './access.js';
import { McpToolError, toErrorPayload } from './errors.js';
import {
  createNote,
  createTask,
  getNote,
  getTask,
  listNotes,
  listTasks,
  searchNotes,
  searchTasks,
  serializeNote,
  serializeNoteSummary,
  serializeTask,
  updateTask,
} from './queries.js';

const statusSchema = z.enum(['todo', 'doing', 'done']);
const prioritySchema = z.enum(['low', 'medium', 'high']);
const limitSchema = z.number().int().min(1).max(100).default(20);
const timeSchema = z.union([z.string().min(1), z.number().int()]);
// Date 只能表示 ±8.64e15 ms，超出后 toISOString() 会抛 RangeError，
// 导致 serializeTask 失败、list_tasks 整体崩溃，所以入库前就把 dueAt 收敛到同一区间。
const dueAtMillisSchema = z.number().int().min(-8640000000000000).max(8640000000000000);

const updateTaskSchema = z.object({
  id: z.string().min(1),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueAt: z.union([z.string().min(1), dueAtMillisSchema, z.null()]).optional(),
  title: z.string().min(1).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
});

const tagListSchema = z.array(z.string().trim().min(1).max(40)).max(20);

const createTaskSchema = z.object({
  title: z.string().trim().min(1, '任务标题不能为空').max(200, '标题最多 200 个字符'),
  description: z.union([z.string().max(20000), z.null()]).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueAt: z.union([z.string().min(1), dueAtMillisSchema, z.null()]).optional(),
  tags: tagListSchema.optional(),
  noteId: z.string().min(1).optional(),
});

const createNoteSchema = z.object({
  content: z.string().max(1_000_000, '笔记正文过长').min(1, '笔记正文不能为空'),
  title: z.string().trim().max(200, '标题最多 200 个字符').optional(),
  tags: tagListSchema.optional(),
  isPinned: z.boolean().optional(),
});

const listTasksSchema = z.object({
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  tag: z.string().min(1).max(40).optional(),
  dueBefore: timeSchema.optional(),
  limit: limitSchema,
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: limitSchema,
});

const getSchema = z.object({ id: z.string().min(1) });

const listNotesSchema = z.object({
  tag: z.string().min(1).max(40).optional(),
  limit: limitSchema,
});

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

const TASK_TOOLS: ToolDefinition[] = [
  {
    name: 'list_tasks',
    description: '列出 Memex 中的任务（只读）。默认返回未完成任务，可按状态、优先级、标签和截止时间过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'doing', 'done'], description: '任务状态' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '优先级' },
        tag: { type: 'string', description: '标签名称' },
        dueBefore: { type: ['string', 'number'], description: 'ISO 8601 时间或毫秒时间戳' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_tasks',
    description: '按关键词搜索任务标题和描述（只读，支持中文）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    description: '按 ID 获取一个任务的完整信息（只读）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '任务 ID' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

const NOTE_TOOLS: ToolDefinition[] = [
  {
    name: 'list_notes',
    description: '列出 Memex 中的笔记（只读）。需要在 Memex 设置中开启笔记访问。',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: '标签名称' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_notes',
    description: '按关键词搜索笔记标题和正文（只读，支持中文）。需要在 Memex 设置中开启笔记访问。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_note',
    description: '按 ID 获取一条笔记的正文和结构化内容（只读）。需要在 Memex 设置中开启笔记访问。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '笔记 ID' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

const NOTE_WRITE_TOOLS: ToolDefinition[] = [
  {
    name: 'create_note',
    description:
      '在 Memex 中新建一条笔记，返回创建后的笔记。正文支持 Markdown（# 标题、- 列表、- [ ] 待办、> 引用、``` 代码块）。需要在 Memex 设置中开启笔记访问和笔记写入。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '笔记正文，支持 Markdown' },
        title: { type: 'string', description: '笔记标题；不传则取正文第一行' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        isPinned: { type: 'boolean', description: '是否置顶' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
];

const NOTE_TOOL_NAMES = new Set([...NOTE_TOOLS, ...NOTE_WRITE_TOOLS].map((tool) => tool.name));

const TASK_WRITE_TOOLS: ToolDefinition[] = [
  {
    name: 'update_task',
    description: '更新 Memex 任务（可修改状态、优先级、截止时间、标题、描述和标签）。需要在 Memex 设置中开启任务写入。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '任务 ID' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'], description: '任务状态' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '优先级' },
        dueAt: {
          anyOf: [
            { type: 'string', description: 'ISO 8601 日期字符串' },
            {
              type: 'number',
              minimum: -8640000000000000,
              maximum: 8640000000000000,
              description: '毫秒时间戳（Date 可表示范围内）',
            },
            { type: 'null', description: '清除截止时间' },
          ],
        },
        title: { type: 'string', description: '任务标题' },
        description: {
          anyOf: [
            { type: 'string', description: '任务描述' },
            { type: 'null', description: '清空描述' },
          ],
        },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: '在 Memex 中新建一条任务，返回创建后的任务。需要在 Memex 设置中开启任务写入。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        description: {
          anyOf: [
            { type: 'string', description: '任务描述' },
            { type: 'null', description: '无描述' },
          ],
        },
        status: { type: 'string', enum: ['todo', 'doing', 'done'], description: '任务状态，默认 todo' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '优先级，默认 medium' },
        dueAt: {
          anyOf: [
            { type: 'string', description: 'ISO 8601 日期字符串' },
            {
              type: 'number',
              minimum: -8640000000000000,
              maximum: 8640000000000000,
              description: '毫秒时间戳（Date 可表示范围内）',
            },
            { type: 'null', description: '无截止时间' },
          ],
        },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        noteId: { type: 'string', description: '关联笔记 ID（可选）' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
];

export interface CreateMemexServerOptions {
  dbPath: string;
}

export function createMemexServer({ dbPath }: CreateMemexServerOptions): Server {
  const server = new Server(
    { name: 'memex', version: '1.6.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mode = withDatabase(dbPath, readAccessMode);
    const canWriteTasks = withDatabase(dbPath, readTaskWriteAccess);
    const canWriteNotes = mode === 'all' && withDatabase(dbPath, readNoteWriteAccess);

    const tools: ToolDefinition[] = [...TASK_TOOLS];
    if (mode === 'all') tools.push(...NOTE_TOOLS);
    if (canWriteTasks) tools.push(...TASK_WRITE_TOOLS);
    if (canWriteNotes) tools.push(...NOTE_WRITE_TOOLS);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const rawArgs = request.params.arguments ?? {};

    try {
      if (NOTE_TOOL_NAMES.has(name)) {
        const mode = withDatabase(dbPath, readAccessMode);
        if (mode !== 'all') {
          throw new McpToolError('ACCESS_DENIED', '笔记访问已关闭，请在 Memex 设置中开启');
        }
      }

      const result = withDatabase(dbPath, (db) => {
        switch (name) {
          case 'list_tasks': {
            const args = listTasksSchema.parse(rawArgs);
            return listTasks(db, args);
          }
          case 'search_tasks': {
            const args = searchSchema.parse(rawArgs);
            return searchTasks(db, args.query, args.limit);
          }
          case 'get_task': {
            const args = getSchema.parse(rawArgs);
            return getTask(db, args.id);
          }
          case 'list_notes': {
            const args = listNotesSchema.parse(rawArgs);
            return listNotes(db, args);
          }
          case 'search_notes': {
            const args = searchSchema.parse(rawArgs);
            return searchNotes(db, args.query, args.limit);
          }
          case 'get_note': {
            const args = getSchema.parse(rawArgs);
            return getNote(db, args.id);
          }
          case 'update_task': {
            const canWrite = withDatabase(dbPath, readTaskWriteAccess);
            if (!canWrite) {
              throw new McpToolError('ACCESS_DENIED', '任务写入已关闭，请在 Memex 设置中开启');
            }
            const args = updateTaskSchema.parse(rawArgs);
            return withWritableDatabase(dbPath, (handle) => updateTask(handle, args));
          }
          case 'create_task': {
            const canWrite = withDatabase(dbPath, readTaskWriteAccess);
            if (!canWrite) {
              throw new McpToolError('ACCESS_DENIED', '任务写入已关闭，请在 Memex 设置中开启');
            }
            const args = createTaskSchema.parse(rawArgs);
            return withWritableDatabase(dbPath, (handle) => createTask(handle, args));
          }
          case 'create_note': {
            const canWrite = withDatabase(dbPath, readNoteWriteAccess);
            if (!canWrite) {
              throw new McpToolError('ACCESS_DENIED', '笔记写入已关闭，请在 Memex 设置中开启');
            }
            const args = createNoteSchema.parse(rawArgs);
            return withWritableDatabase(dbPath, (handle) => createNote(handle, args));
          }
          default:
            throw new McpToolError('INVALID_ARGUMENT', `未知工具：${name}`);
        }
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: toErrorPayload(new McpToolError('INVALID_ARGUMENT', error.issues.map((issue) => issue.message).join('; '))),
            },
          ],
        };
      }
      return {
        isError: true,
        content: [{ type: 'text' as const, text: toErrorPayload(error) }],
      };
    }
  });

  return server;
}

export { serializeNote, serializeNoteSummary, serializeTask };
