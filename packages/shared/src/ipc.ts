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
  TaskTimerAction,
  TaskTimerState,
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

import type {
  TeamBootstrap, TeamCreateInput, TeamInviteCreateInput, TeamJoinInput, TeamNotification,
  TeamProgressNote, TeamRolePatch, TeamSignInInput, TeamSignUpInput, TeamSyncState, TeamTask,
  TeamTaskEvent, TeamTaskFilter, TeamTaskInput, TeamTaskPatch,
} from './team/types.js';

export interface MemexApi {
  team: {
    bootstrap(): Promise<TeamBootstrap>;
    signIn(input: TeamSignInInput): Promise<TeamBootstrap>;
    signUp(input: TeamSignUpInput): Promise<{ needsEmailConfirmation: boolean }>;
    signOut(): Promise<void>;
    createTeam(input: TeamCreateInput): Promise<TeamBootstrap>;
    joinTeam(input: TeamJoinInput): Promise<TeamBootstrap>;
    listTasks(filter?: TeamTaskFilter): Promise<TeamTask[]>;
    listNotifications(): Promise<TeamNotification[]>;
    getTask(id: string): Promise<TeamTask | null>;
    getTaskNotes(taskId: string): Promise<TeamProgressNote[]>;
    getTaskEvents(taskId: string): Promise<TeamTaskEvent[]>;
    createTask(input: TeamTaskInput): Promise<TeamTask>;
    updateTask(id: string, patch: TeamTaskPatch): Promise<TeamTask>;
    startAssignee(taskId: string, expectedVersion: number): Promise<void>;
    addProgressNote(taskId: string, body: string): Promise<void>;
    submitAssignee(taskId: string, body: string, expectedVersion: number): Promise<void>;
    reviewAssignee(taskId: string, assigneeId: string, decision: 'approve' | 'return', note: string | null, expectedVersion: number): Promise<void>;
    reopenTask(taskId: string, expectedVersion: number): Promise<void>;
    archiveTask(taskId: string, expectedVersion: number): Promise<void>;
    closeAssignee(taskId: string, assigneeId: string, reason: string, expectedVersion: number): Promise<void>;
    createInvite(input: TeamInviteCreateInput): Promise<string>;
    revokeInvite(inviteId: string): Promise<void>;
    setMemberRole(patch: TeamRolePatch): Promise<void>;
    removeMember(userId: string): Promise<void>;
    markNotificationRead(id: string): Promise<void>;
    sync(): Promise<TeamSyncState>;
    onSyncState(callback: (state: TeamSyncState) => void): () => void;
  };
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
  timer: {
    /** 主窗口把最新计时状态推给主进程，由主进程转发给桌面小组件。 */
    sync(state: TaskTimerState | null): void;
    getState(): Promise<TaskTimerState | null>;
    onState(callback: (state: TaskTimerState | null) => void): () => void;
    /** 小组件里的操作（暂停/继续/加时/结束/打开任务）转给主窗口执行。 */
    sendAction(action: TaskTimerAction): void;
    onAction(callback: (action: TaskTimerAction) => void): () => void;
  };
}

export const IPC = {
  teamBootstrap: 'team:bootstrap',
  teamSignIn: 'team:sign-in',
  teamSignUp: 'team:sign-up',
  teamSignOut: 'team:sign-out',
  teamCreateTeam: 'team:create-team',
  teamJoinTeam: 'team:join-team',
  teamTasksList: 'team:tasks-list',
  teamTasksGet: 'team:tasks-get',
  teamNotificationsList: 'team:notifications-list',
  teamTaskNotes: 'team:task-notes',
  teamTaskEvents: 'team:task-events',
  teamTasksCreate: 'team:tasks-create',
  teamTasksUpdate: 'team:tasks-update',
  teamStartAssignee: 'team:start-assignee',
  teamAddNote: 'team:add-note',
  teamSubmitAssignee: 'team:submit-assignee',
  teamReviewAssignee: 'team:review-assignee',
  teamReopenTask: 'team:reopen-task',
  teamArchiveTask: 'team:archive-task',
  teamCloseAssignee: 'team:close-assignee',
  teamCreateInvite: 'team:create-invite',
  teamRevokeInvite: 'team:revoke-invite',
  teamSetMemberRole: 'team:set-member-role',
  teamRemoveMember: 'team:remove-member',
  teamMarkNotificationRead: 'team:mark-notification-read',
  teamSync: 'team:sync',
  teamSyncState: 'team:sync-state',
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
  timerSync: 'timer:sync',
  timerGetState: 'timer:get-state',
  timerState: 'timer:state',
  timerAction: 'timer:action',
} as const;
