import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveDbPath } from '@memex/shared';
import { createMemexServer } from './server.js';

const dbPath = process.env.MEMEX_DB_PATH ?? resolveDbPath();
const server = createMemexServer({ dbPath });
const transport = new StdioServerTransport();

await server.connect(transport);
