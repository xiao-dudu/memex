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

describe('create_task tool', () => {
  function enableTaskWrite() {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'mcp_task_write'").run();
  }

  it('未开启任务写入时不可见且调用被拒绝', async () => {
    const { server, client } = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain('create_task');

    const denied = await client.callTool({ name: 'create_task', arguments: { title: '临时任务' } });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain('ACCESS_DENIED');
    await client.close();
    await server.close();
  });

  it('创建后返回任务并可被 list_tasks 读到', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('create_task');

    const created = await client.callTool({
      name: 'create_task',
      arguments: {
        title: '  写周报  ',
        description: '汇总本周进展',
        priority: 'high',
        dueAt: '2030-01-01T00:00:00.000Z',
        tags: ['工作'],
      },
    });
    const payload = JSON.parse(textOf(created)) as {
      task: { id: string; title: string; status: string; priority: string; dueAt: string; tags: string[]; createdAt: string };
    };
    expect(payload.task.title).toBe('写周报');
    expect(payload.task.status).toBe('todo');
    expect(payload.task.priority).toBe('high');
    expect(payload.task.dueAt).toBe('2030-01-01T00:00:00.000Z');
    expect(payload.task.tags).toEqual(['工作']);
    expect(payload.task.createdAt).toMatch(/T.*Z$/);

    const listed = JSON.parse(textOf(await client.callTool({ name: 'list_tasks', arguments: { limit: 20 } }))) as { id: string }[];
    expect(listed.map((task) => task.id)).toContain(payload.task.id);
    await client.close();
    await server.close();
  });

  it('只传标题时使用默认状态与优先级', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    const created = await client.callTool({ name: 'create_task', arguments: { title: '整理收件箱' } });
    const payload = JSON.parse(textOf(created)) as { task: { status: string; priority: string; dueAt: string | null; description: string | null } };
    expect(payload.task.status).toBe('todo');
    expect(payload.task.priority).toBe('medium');
    expect(payload.task.dueAt).toBeNull();
    expect(payload.task.description).toBeNull();
    await client.close();
    await server.close();
  });

  it('可直接创建已完成任务并带上 completedAt', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    const created = await client.callTool({ name: 'create_task', arguments: { title: '已完成的活', status: 'done' } });
    const payload = JSON.parse(textOf(created)) as { task: { status: string; completedAt: string | null } };
    expect(payload.task.status).toBe('done');
    expect(payload.task.completedAt).toMatch(/T.*Z$/);
    await client.close();
    await server.close();
  });

  it('标题为空白时返回 INVALID_ARGUMENT 且不落库', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'create_task', arguments: { title: '   ' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('INVALID_ARGUMENT');

    const count = db.prepare('SELECT count(*) AS n FROM tasks').get() as { n: number };
    expect(count.n).toBe(1);
    await client.close();
    await server.close();
  });

  it('noteId 指向不存在的笔记时返回 NOT_FOUND', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'create_task', arguments: { title: '关联任务', noteId: 'missing-note' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('NOT_FOUND');
    await client.close();
    await server.close();
  });

  it('noteId 指向已软删除的笔记时返回 NOT_FOUND', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    createNoteRepository(db).softDelete(noteId);
    const result = await client.callTool({ name: 'create_task', arguments: { title: '关联任务', noteId } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('NOT_FOUND');
    await client.close();
    await server.close();
  });

  it('可关联已有笔记并返回 noteTitle', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    const created = await client.callTool({ name: 'create_task', arguments: { title: '补充细节', noteId } });
    const payload = JSON.parse(textOf(created)) as { task: { noteId: string; noteTitle: string } };
    expect(payload.task.noteId).toBe(noteId);
    expect(payload.task.noteTitle).toBe('项目计划细节');
    await client.close();
    await server.close();
  });

  it('dueAt 超出 Date 可表示范围时被拒绝', async () => {
    enableTaskWrite();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'create_task', arguments: { title: '坏时间', dueAt: 9007199254740991 } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('INVALID_ARGUMENT');
    await client.close();
    await server.close();
  });
});

describe('create_note tool', () => {
  function enableNoteWrite() {
    // mcp_note_write 是新键，老库里没有对应行，UPDATE 会静默命中 0 行，必须用 upsert。
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('mcp_access_mode', '\"all\"'), ('mcp_note_write', 'true')").run();
  }

  it('只开启笔记读取时不可见且调用被拒绝', async () => {
    db.prepare("UPDATE settings SET value = '\"all\"' WHERE key = 'mcp_access_mode'").run();
    const { server, client } = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain('create_note');

    const denied = await client.callTool({ name: 'create_note', arguments: { content: '临时笔记' } });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain('ACCESS_DENIED');
    await client.close();
    await server.close();
  });

  it('笔记访问关闭时即使写入开关为真也拒绝', async () => {
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('mcp_access_mode', '\"tasks\"'), ('mcp_note_write', 'true')").run();
    const { server, client } = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain('create_note');
    const denied = await client.callTool({ name: 'create_note', arguments: { content: '临时笔记' } });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain('ACCESS_DENIED');
    await client.close();
    await server.close();
  });

  it('创建纯文本笔记：按行成段，标题取第一行', async () => {
    enableNoteWrite();
    const { server, client } = await connect();
    const created = await client.callTool({
      name: 'create_note',
      arguments: { content: '项目复盘\n第一行正文\n第二行正文', tags: ['复盘'] },
    });
    const payload = JSON.parse(textOf(created)) as {
      note: { id: string; title: string; plainText: string; tags: string[]; content: { content: { type: string }[] } };
    };
    expect(payload.note.title).toBe('项目复盘');
    expect(payload.note.plainText).toBe('项目复盘\n第一行正文\n第二行正文');
    expect(payload.note.tags).toEqual(['复盘']);
    expect(payload.note.content.content.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);

    const listed = JSON.parse(textOf(await client.callTool({ name: 'list_notes', arguments: { limit: 20 } }))) as { id: string }[];
    expect(listed.map((note) => note.id)).toContain(payload.note.id);
    await client.close();
    await server.close();
  });

  it('Markdown 正文转成结构化文档，plainText 不含标记', async () => {
    enableNoteWrite();
    const { server, client } = await connect();
    const created = await client.callTool({
      name: 'create_note',
      arguments: {
        content: '# 周会纪要\n\n- 完成 MCP 工具\n- [x] 写测试\n\n**结论**：继续推进\n\n> 下周同步\n\n```ts\nconst a = 1;\n```',
      },
    });
    const payload = JSON.parse(textOf(created)) as {
      note: {
        title: string;
        plainText: string;
        content: {
          content: {
            type: string;
            attrs?: { level?: number; checked?: boolean; language?: string | null };
            content?: { type: string; text?: string; marks?: { type: string }[]; attrs?: { checked?: boolean } }[];
          }[];
        };
      };
    };

    const blocks = payload.note.content.content;
    expect(blocks.map((node) => node.type)).toEqual(['heading', 'bulletList', 'taskList', 'paragraph', 'blockquote', 'codeBlock']);
    expect(blocks[0]?.attrs?.level).toBe(1);
    expect(blocks[2]?.content?.[0]?.attrs?.checked).toBe(true);
    expect(blocks[3]?.content?.[0]?.marks?.[0]?.type).toBe('bold');
    expect(blocks[5]?.attrs?.language).toBe('ts');
    expect(blocks[5]?.content?.[0]?.text).toBe('const a = 1;');

    expect(payload.note.title).toBe('周会纪要');
    expect(payload.note.plainText).not.toContain('#');
    expect(payload.note.plainText).not.toContain('**');
    expect(payload.note.plainText).toContain('完成 MCP 工具');
    await client.close();
    await server.close();
  });

  it('显式标题优先于正文第一行', async () => {
    enableNoteWrite();
    const { server, client } = await connect();
    const created = await client.callTool({ name: 'create_note', arguments: { content: '正文第一行', title: '自定义标题' } });
    const payload = JSON.parse(textOf(created)) as { note: { title: string } };
    expect(payload.note.title).toBe('自定义标题');
    await client.close();
    await server.close();
  });

  it('正文为空白时返回 INVALID_ARGUMENT 且不落库', async () => {
    enableNoteWrite();
    const { server, client } = await connect();
    const result = await client.callTool({ name: 'create_note', arguments: { content: '   \n  ' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('INVALID_ARGUMENT');

    const count = db.prepare('SELECT count(*) AS n FROM notes').get() as { n: number };
    expect(count.n).toBe(1);
    await client.close();
    await server.close();
  });
});
