import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createNoteRepository,
  createTaskRepository,
  openDatabase,
  runMigrations,
  type MemexDatabase,
} from '@memex/shared';
import { createMemexServer } from '../server.js';

let db: MemexDatabase;
let dbPath: string;
let taskId: string;
let noteId: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), 'memex-mcp-')), 'test.db');
  db = openDatabase(dbPath);
  runMigrations(db);
  taskId = createTaskRepository(db).create({ title: '项目计划评审', priority: 'high', tags: ['工作'] }).id;
  noteId = createNoteRepository(db).create({ contentJson: '{"type":"doc","content":[]}', plainText: '项目计划细节\n第二行' }).id;
});

async function connect() {
  const server = createMemexServer({ dbPath });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'memex-test', version: '0.1.0' });
  await client.connect(clientTransport);
  return { server, client };
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content[0]?.text ?? '';
}

describe('memex MCP server', () => {
  it('exposes task tools only in the default mode', async () => {
    const { server, client } = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['list_tasks', 'search_tasks', 'get_task']);

    const denied = await client.callTool({ name: 'list_notes', arguments: {} });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain('ACCESS_DENIED');

    await client.close();
    await server.close();
  });

  it('returns tasks with ISO timestamps and supports search', async () => {
    const { server, client } = await connect();
    const listed = await client.callTool({ name: 'list_tasks', arguments: { limit: 20 } });
    const tasks = JSON.parse(textOf(listed)) as { title: string; createdAt: string }[];
    expect(tasks[0]?.title).toBe('项目计划评审');
    expect(tasks[0]?.createdAt).toMatch(/T.*Z$/);

    const searched = await client.callTool({ name: 'search_tasks', arguments: { query: '项目计划' } });
    expect((JSON.parse(textOf(searched)) as { id: string }[])[0]?.id).toBe(taskId);

    await client.close();
    await server.close();
  });

  it('unlocks note tools immediately after the setting changes', async () => {
    const { server, client } = await connect();
    db.prepare("UPDATE settings SET value = '\"all\"' WHERE key = 'mcp_access_mode'").run();

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain('list_notes');

    const listed = await client.callTool({ name: 'list_notes', arguments: { limit: 20 } });
    const notes = JSON.parse(textOf(listed)) as { id: string; title: string }[];
    expect(notes[0]?.title).toBe('项目计划细节');

    const note = await client.callTool({ name: 'get_note', arguments: { id: noteId } });
    const detail = JSON.parse(textOf(note)) as { plainText: string; content: unknown };
    expect(detail.plainText).toContain('项目计划细节');
    expect(detail.content).toBeTypeOf('object');

    await client.close();
    await server.close();
  });

  it('写入开关关闭时工具不可见且调用被拒绝', async () => {
    const { server, client } = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).not.toContain('update_task');

    const denied = await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'done' } });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain('ACCESS_DENIED');

    await client.close();
    await server.close();
  });

  it('开启开关后工具立即可见，关闭后立即失效', async () => {
    const { server, client } = await connect();
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('update_task');

    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'mcp_task_write'").run();
    const denied = await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'done' } });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain('ACCESS_DENIED');

    await client.close();
    await server.close();
  });
});

describe('update_task tool', () => {
  it('改状态时返回 changes 并联动 completedAt', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const updated = await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'done' } });
    const payload = JSON.parse(textOf(updated)) as { task: { status: string; completedAt: string | null }; changes: string[] };
    expect(payload.task.status).toBe('done');
    expect(payload.task.completedAt).toMatch(/T.*Z$/);
    expect(payload.changes).toEqual(['status']);
    await client.close();
    await server.close();
  });

  it('从 done 改回 todo 时清空 completedAt', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'done' } });
    const reverted = await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'todo' } });
    const payload = JSON.parse(textOf(reverted)) as { task: { completedAt: string | null } };
    expect(payload.task.completedAt).toBeNull();
    await client.close();
    await server.close();
  });

  it('可同时改多个字段', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const result = await client.callTool({
      name: 'update_task',
      arguments: { id: taskId, priority: 'low', tags: ['工作', '紧急'] },
    });
    const payload = JSON.parse(textOf(result)) as { task: { priority: string; tags: string[] }; changes: string[] };
    expect(payload.task.priority).toBe('low');
    expect(payload.task.tags).toEqual(['工作', '紧急']);
    expect(payload.changes.sort()).toEqual(['priority', 'tags']);
    await client.close();
    await server.close();
  });

  it('空数组可清空标签', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    await client.callTool({ name: 'update_task', arguments: { id: taskId, tags: [] } });
    const payload = JSON.parse(textOf(await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'doing' } }))) as { task: { tags: string[] } };
    expect(payload.task.tags).toEqual([]);
    await client.close();
    await server.close();
  });

  it('任务不存在时返回 NOT_FOUND', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'update_task', arguments: { id: 'missing-id', status: 'done' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('NOT_FOUND');
    await client.close();
    await server.close();
  });

  it('已软删除任务返回 NOT_FOUND', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    createTaskRepository(db).softDelete(taskId);
    const result = await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'done' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('NOT_FOUND');
    await client.close();
    await server.close();
  });

  it('仅传 id 时返回 INVALID_ARGUMENT', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'update_task', arguments: { id: taskId } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('INVALID_ARGUMENT');
    await client.close();
    await server.close();
  });

  it('title 为空白时返回 INVALID_ARGUMENT', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'update_task', arguments: { id: taskId, title: '   ' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('INVALID_ARGUMENT');
    await client.close();
    await server.close();
  });

  it('dueAt 可传 ISO 字符串与 null', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    await client.callTool({ name: 'update_task', arguments: { id: taskId, dueAt: '2030-01-01T00:00:00.000Z' } });
    const withDue = JSON.parse(textOf(await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'doing' } }))) as { task: { dueAt: string } };
    expect(withDue.task.dueAt).toBe('2030-01-01T00:00:00.000Z');

    await client.callTool({ name: 'update_task', arguments: { id: taskId, dueAt: null } });
    const cleared = JSON.parse(textOf(await client.callTool({ name: 'update_task', arguments: { id: taskId, status: 'doing' } }))) as { task: { dueAt: string | null } };
    expect(cleared.task.dueAt).toBeNull();
    await client.close();
    await server.close();
  });

  it('dueAt 可传毫秒时间戳', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const dueAt = Date.UTC(2030, 0, 1);
    const updated = await client.callTool({ name: 'update_task', arguments: { id: taskId, dueAt } });
    const payload = JSON.parse(textOf(updated)) as { task: { dueAt: string }; changes: string[] };
    expect(payload.task.dueAt).toBe('2030-01-01T00:00:00.000Z');
    expect(payload.changes).toEqual(['dueAt']);
    await client.close();
    await server.close();
  });

  it('dueAt 超出 Date 可表示范围时被拒绝，且不写入数据库', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    const { server, client } = await connect();
    const before = db.prepare('SELECT updated_at, due_at FROM tasks WHERE id = ?').get(taskId) as { updated_at: number; due_at: number | null };

    const rejected = await client.callTool({ name: 'update_task', arguments: { id: taskId, dueAt: 9007199254740991 } });
    expect(rejected.isError).toBe(true);
    expect(textOf(rejected)).toContain('INVALID_ARGUMENT');

    // 拒绝必须发生在写入之前：updated_at / due_at 都没被动过。
    const after = db.prepare('SELECT updated_at, due_at FROM tasks WHERE id = ?').get(taskId) as { updated_at: number; due_at: number | null };
    expect(after.updated_at).toBe(before.updated_at);
    expect(after.due_at).toBe(before.due_at);

    // 没有被毒化的行，list_tasks 照常工作。
    const listed = await client.callTool({ name: 'list_tasks', arguments: { limit: 20 } });
    expect(listed.isError).toBeFalsy();
    const tasks = JSON.parse(textOf(listed)) as { id: string; dueAt: string | null }[];
    expect(tasks.find((task) => task.id === taskId)?.dueAt).toBeNull();
    await client.close();
    await server.close();
  });

  it('due_at 已损坏的历史数据不会让 list_tasks 整体失败', async () => {
    const { server, client } = await connect();
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(9007199254740991, taskId);

    const listed = await client.callTool({ name: 'list_tasks', arguments: { limit: 20 } });
    expect(listed.isError).toBeFalsy();
    const tasks = JSON.parse(textOf(listed)) as { id: string; dueAt: string | null }[];
    expect(tasks.find((task) => task.id === taskId)?.dueAt).toBeNull();

    await client.close();
    await server.close();
  });

  it('description 可传 null 清空描述', async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
    db.prepare('UPDATE tasks SET description = ? WHERE id = ?').run('待补充范围', taskId);
    const { server, client } = await connect();
    const updated = await client.callTool({ name: 'update_task', arguments: { id: taskId, description: null } });
    const payload = JSON.parse(textOf(updated)) as { task: { description: string | null }; changes: string[] };
    expect(payload.task.description).toBeNull();
    expect(payload.changes).toEqual(['description']);

    const reread = JSON.parse(textOf(await client.callTool({ name: 'get_task', arguments: { id: taskId } }))) as { description: string | null };
    expect(reread.description).toBeNull();
    await client.close();
    await server.close();
  });
});
