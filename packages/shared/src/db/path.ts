import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolves the one database location shared by the app and the MCP server.
 * The main process passes its userData directory; MCP passes MEMEX_DB_PATH.
 */
export function resolveDbPath(override?: string): string {
  if (override) return override;
  if (process.env.MEMEX_DB_PATH) return process.env.MEMEX_DB_PATH;
  const base = process.env.APPDATA ?? join(homedir(), '.config');
  return join(base, 'Memex', 'memex.db');
}
