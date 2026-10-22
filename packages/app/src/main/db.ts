import { app, net, safeStorage } from 'electron';
import { join } from 'node:path';
import {
  createNoteRepository,
  createReportRepository,
  createReportTemplateRepository,
  createSearchRepository,
  createSettingsRepository,
  createTagRepository,
  createTaskRepository,
  openDatabase,
  runMigrations,
  type MemexDatabase,
} from '@memex/shared';
import { createAiConfigStore, createElectronSecretAdapter } from './ai-config.js';
import { requestChatCompletion, type FetchLike } from './ai-client.js';
import { createReportService } from './report-service.js';

let database: MemexDatabase | null = null;
let databasePath = '';
let repositories: ReturnType<typeof buildRepositories> | null = null;

const netFetch = ((input, init) => net.fetch(String(input), init)) as FetchLike;
const reportRequest: typeof requestChatCompletion = (config, messages, _fetchImpl, signal) =>
  requestChatCompletion(config, messages, netFetch, signal);

function buildRepositories(db: MemexDatabase) {
  const aiConfig = createAiConfigStore(db, createElectronSecretAdapter(safeStorage));
  const reportTemplates = createReportTemplateRepository(db);
  const reports = createReportRepository(db);
  return {
    tasks: createTaskRepository(db),
    notes: createNoteRepository(db),
    tags: createTagRepository(db),
    search: createSearchRepository(db),
    settings: createSettingsRepository(db),
    aiConfig,
    reportTemplates,
    reports,
    reportService: createReportService({
      templates: reportTemplates,
      reports,
      aiConfig,
      request: reportRequest,
      now: Date.now,
    }),
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
