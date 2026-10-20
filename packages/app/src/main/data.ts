import { app, clipboard } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backupDatabase, exportAll, pruneBackups, timestampForFile } from '@memex/shared';
import { getDb, getDbPath, getRepositories } from './db.js';

export function buildMcpConfig(): string {
  const mcpEntry = app.isPackaged
    ? join(process.resourcesPath, 'mcp', 'index.mjs')
    : resolve(app.getAppPath(), '..', 'mcp', 'dist', 'index.mjs');

  return JSON.stringify(
    {
      mcpServers: {
        memex: {
          command: process.execPath,
          args: [mcpEntry],
          env: {
            ELECTRON_RUN_AS_NODE: '1',
            MEMEX_DB_PATH: getDbPath(),
          },
        },
      },
    },
    null,
    2,
  );
}

export function copyMcpConfig(): boolean {
  clipboard.writeText(buildMcpConfig());
  return true;
}

export async function backupNow(): Promise<string> {
  const backupDir = join(app.getPath('userData'), 'backups');
  const target = await backupDatabase(getDb(), backupDir);
  pruneBackups(backupDir, 7);
  getRepositories().settings.update({ lastBackupAt: Date.now() });
  return target;
}

export async function maybeDailyBackup(): Promise<string | null> {
  const settings = getRepositories().settings.get();
  if (Date.now() - settings.lastBackupAt < 24 * 60 * 60 * 1000) return null;
  return backupNow();
}

export function exportJson(): string {
  const exportDir = join(app.getPath('userData'), 'exports');
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });
  const target = join(exportDir, `memex-export-${timestampForFile()}.json`);
  writeFileSync(target, JSON.stringify(exportAll(getDb()), null, 2), 'utf8');
  return target;
}
