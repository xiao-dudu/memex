import type {
  AppInfo,
  MemexSettings,
  Note,
  NoteCounts,
  NoteFilter,
  NoteInput,
  NotePatch,
  NoteSummary,
  SearchResults,
  Tag,
  Task,
  TaskCounts,
  TaskFilter,
  TaskInput,
  TaskPatch,
  UpdateState,
} from './types.js';
import type {
  AiServiceConfig,
  AiServiceConfigPatch,
  Report,
  ReportCandidate,
  ReportGenerateInput,
  ReportSummary,
  ReportTemplate,
  ReportTemplateInput,
  ReportTemplatePatch,
  ReportUpdateInput,
} from './reports/types.js';

export interface MemexApi {
  tasks: {
    list(filter?: TaskFilter): Promise<Task[]>;
    get(id: string): Promise<Task | null>;
    create(input: TaskInput): Promise<Task>;
    update(id: string, patch: TaskPatch): Promise<Task>;
    remove(id: string): Promise<void>;
    restore(id: string): Promise<void>;
    purge(id: string): Promise<void>;
    counts(): Promise<TaskCounts>;
  };
  notes: {
    list(filter?: NoteFilter): Promise<NoteSummary[]>;
    get(id: string): Promise<Note | null>;
    create(input: NoteInput): Promise<Note>;
    update(id: string, patch: NotePatch): Promise<Note>;
    remove(id: string): Promise<void>;
    restore(id: string): Promise<void>;
    purge(id: string): Promise<void>;
    counts(): Promise<NoteCounts>;
  };
  tags: {
    list(): Promise<Tag[]>;
    remove(id: string): Promise<void>;
  };
  search(query: string, limit?: number): Promise<SearchResults>;
  settings: {
    get(): Promise<MemexSettings>;
    update(patch: Partial<MemexSettings>): Promise<MemexSettings>;
  };
  templates: {
    list(): Promise<ReportTemplate[]>;
    get(id: string): Promise<ReportTemplate | null>;
    create(input: ReportTemplateInput): Promise<ReportTemplate>;
    update(id: string, patch: ReportTemplatePatch): Promise<ReportTemplate>;
    remove(id: string): Promise<void>;
  };
  reports: {
    list(): Promise<ReportSummary[]>;
    get(id: string): Promise<Report | null>;
    candidates(query: { periodStart: number; periodEnd: number }): Promise<ReportCandidate[]>;
    generate(input: ReportGenerateInput): Promise<Report>;
    cancel(): Promise<void>;
    update(id: string, patch: ReportUpdateInput): Promise<Report>;
    remove(id: string): Promise<void>;
    exportMarkdown(id: string): Promise<string | null>;
    exportPdf(id: string): Promise<string | null>;
  };
  ai: {
    getConfig(): Promise<AiServiceConfig>;
    updateConfig(patch: AiServiceConfigPatch): Promise<AiServiceConfig>;
    testConnection(patch?: AiServiceConfigPatch): Promise<{ ok: true; latencyMs: number }>;
  };
  app: {
    info(): Promise<AppInfo>;
    copyMcpConfig(): Promise<boolean>;
    backupNow(): Promise<string>;
    exportJson(): Promise<string>;
  };
  update: {
    check(): Promise<UpdateState>;
    install(): Promise<UpdateState>;
    getState(): Promise<UpdateState>;
    onState(callback: (state: UpdateState) => void): () => void;
  };
  window: {
    showMain(): Promise<void>;
    hideQuickCapture(): Promise<void>;
    setTheme(theme: 'system' | 'light' | 'dark'): Promise<void>;
  };
}

export const IPC = {
  tasksList: 'tasks:list',
  tasksGet: 'tasks:get',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksDelete: 'tasks:delete',
  tasksRestore: 'tasks:restore',
  tasksPurge: 'tasks:purge',
  tasksCounts: 'tasks:counts',
  notesList: 'notes:list',
  notesGet: 'notes:get',
  notesCreate: 'notes:create',
  notesUpdate: 'notes:update',
  notesDelete: 'notes:delete',
  notesRestore: 'notes:restore',
  notesPurge: 'notes:purge',
  notesCounts: 'notes:counts',
  tagsList: 'tags:list',
  tagsRemove: 'tags:remove',
  search: 'search:query',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  templatesList: 'templates:list',
  templatesGet: 'templates:get',
  templatesCreate: 'templates:create',
  templatesUpdate: 'templates:update',
  templatesDelete: 'templates:delete',
  reportsList: 'reports:list',
  reportsGet: 'reports:get',
  reportsCandidates: 'reports:candidates',
  reportsGenerate: 'reports:generate',
  reportsCancel: 'reports:cancel',
  reportsUpdate: 'reports:update',
  reportsDelete: 'reports:delete',
  reportsExportMarkdown: 'reports:export-markdown',
  reportsExportPdf: 'reports:export-pdf',
  aiGetConfig: 'ai:get-config',
  aiUpdateConfig: 'ai:update-config',
  aiTestConnection: 'ai:test-connection',
  appInfo: 'app:info',
  appCopyMcpConfig: 'app:copy-mcp-config',
  appBackupNow: 'app:backup-now',
  appExportJson: 'app:export-json',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateGetState: 'update:get-state',
  updateState: 'update:state',
  windowShowMain: 'window:show-main',
  windowHideQuickCapture: 'window:hide-quick-capture',
  windowSetTheme: 'window:set-theme',
} as const;
