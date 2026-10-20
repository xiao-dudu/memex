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
});
