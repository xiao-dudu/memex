import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readAccessMode, withDatabase } from './access.js';
import { McpToolError, toErrorPayload } from './errors.js';
import {
  getNote,
  getTask,
  listNotes,
  listTasks,
  searchNotes,
  searchTasks,
  serializeNote,
  serializeNoteSummary,
  serializeTask,
} from './queries.js';

const statusSchema = z.enum(['todo', 'doing', 'done']);
const prioritySchema = z.enum(['low', 'medium', 'high']);
const limitSchema = z.number().int().min(1).max(100).default(20);
const timeSchema = z.union([z.string().min(1), z.number().int()]);

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

const TASK_TOOLS = [
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

const NOTE_TOOLS = [
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

const NOTE_TOOL_NAMES = new Set(NOTE_TOOLS.map((tool) => tool.name));

export interface CreateMemexServerOptions {
  dbPath: string;
}

export function createMemexServer({ dbPath }: CreateMemexServerOptions): Server {
  const server = new Server(
    { name: 'memex', version: '1.1.5' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mode = withDatabase(dbPath, readAccessMode);
    return { tools: mode === 'all' ? [...TASK_TOOLS, ...NOTE_TOOLS] : TASK_TOOLS };
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
