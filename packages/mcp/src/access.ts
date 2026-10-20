import { getSchemaVersion, LATEST_SCHEMA_VERSION, openDatabase } from '@memex/shared';
import type { MemexDatabase } from '@memex/shared';
import { McpToolError } from './errors.js';

export function withDatabase<T>(dbPath: string, handler: (db: MemexDatabase) => T): T {
  let db: MemexDatabase;
  try {
    db = openDatabase(dbPath, { readonly: true });
  } catch (error) {
    throw new McpToolError('DB_OUTDATED', `无法打开数据库：${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    if (getSchemaVersion(db) < LATEST_SCHEMA_VERSION) {
      throw new McpToolError('DB_OUTDATED', '数据库结构已过期，请先打开 Memex 完成升级');
    }
    return handler(db);
  } finally {
    db.close();
  }
}

export function readAccessMode(db: MemexDatabase): 'tasks' | 'all' {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'mcp_access_mode'").get() as { value: string } | undefined;
  if (!row) return 'tasks';
  try {
    return JSON.parse(row.value) === 'all' ? 'all' : 'tasks';
  } catch {
    return 'tasks';
  }
}
