import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { MemexDatabase } from './db/database.js';

export function timestampForFile(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export async function backupDatabase(db: MemexDatabase, backupDir: string, now = new Date()): Promise<string> {
  mkdirSync(backupDir, { recursive: true });
  const target = join(backupDir, `memex-${timestampForFile(now)}.db`);
  await db.backupTo(target);
  return target;
}

export function listBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((name) => /^memex-\d{8}-\d{6}\.db$/.test(name))
    .map((name) => join(backupDir, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

export function pruneBackups(backupDir: string, keep = 7): string[] {
  const backups = listBackups(backupDir);
  const removed: string[] = [];
  for (const path of backups.slice(keep)) {
    unlinkSync(path);
    removed.push(basename(path));
  }
  return removed;
}
