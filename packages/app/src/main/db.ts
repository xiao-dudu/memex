import { app } from 'electron';
import { join } from 'node:path';
import {
  createNoteRepository,
  createSearchRepository,
  createSettingsRepository,
  createTagRepository,
  createTaskRepository,
  openDatabase,
  runMigrations,
  type MemexDatabase,
} from '@memex/shared';

let database: MemexDatabase | null = null;
let databasePath = '';
let repositories: ReturnType<typeof buildRepositories> | null = null;

function buildRepositories(db: MemexDatabase) {
  return {
    tasks: createTaskRepository(db),
    notes: createNoteRepository(db),
    tags: createTagRepository(db),
    search: createSearchRepository(db),
    settings: createSettingsRepository(db),
  };
}

export function initDatabase(): void {
  databasePath = process.env.MEMEX_DB_PATH ?? join(app.getPath('userData'), 'memex.db');
  database = openDatabase(databasePath);
  runMigrations(database);
  purgeExpiredTrash(database);
  repositories = buildRepositories(database);
}

function purgeExpiredTrash(db: MemexDatabase): void {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
  db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
}

export function getDb(): MemexDatabase {
  if (!database) throw new Error('数据库尚未初始化');
  return database;
}

export function getDbPath(): string {
  return databasePath;
}

export function getRepositories(): ReturnType<typeof buildRepositories> {
  if (!repositories) throw new Error('仓储层尚未初始化');
  return repositories;
}

export function closeDatabase(): void {
  database?.close();
  database = null;
  repositories = null;
}
