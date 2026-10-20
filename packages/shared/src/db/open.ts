import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { MemexDatabase } from './database.js';

export interface OpenOptions {
  /**
   * Restrict the connection to reads. query_only is enabled by the wrapper so
   * accidental writes fail even if a query bug slips through.
   */
  readonly?: boolean;
}

export function openDatabase(path: string, options: OpenOptions = {}): MemexDatabase {
  const readonly = options.readonly ?? false;
  if (readonly && !existsSync(path)) {
    throw new Error(`数据库不存在：${path}`);
  }
  if (!readonly) {
    mkdirSync(dirname(path), { recursive: true });
  }
  return new MemexDatabase(path, { readonly });
}
