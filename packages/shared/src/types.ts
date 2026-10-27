export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskView = 'inbox' | 'today' | 'upcoming' | 'done' | 'trash';
export type NoteView = 'all' | 'pinned' | 'trash';
export type ThemeMode = 'system' | 'light' | 'dark';
export type McpAccessMode = 'tasks' | 'all';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  /** TipTap 文档 JSON；老数据为 null，读取时由 description 现算。 */
  descriptionJson: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: number | null;
  noteId: string | null;
  noteTitle: string | null;
  noteInTrash: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
  tags: string[];
}

export interface TaskCounts {
  inbox: number;
  today: number;
  upcoming: number;
  done: number;
  trash: number;
}

export interface NoteSummary {
  id: string;
  title: string;
  excerpt: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  tags: string[];
}

export interface Note extends NoteSummary {
  contentJson: string;
  plainText: string;
}

export interface NoteCounts {
  all: number;
  pinned: number;
  trash: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  taskCount?: number;
  noteCount?: number;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  descriptionJson?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: number | null;
  noteId?: string | null;
  tags?: string[];
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  descriptionJson?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: number | null;
  noteId?: string | null;
  tags?: string[];
}

export interface NoteInput {
  contentJson: string;
  plainText: string;
  title?: string;
  isPinned?: boolean;
  tags?: string[];
}

export interface NotePatch {
  contentJson?: string;
  plainText?: string;
  title?: string;
  isPinned?: boolean;
  tags?: string[];
}

export interface TaskFilter {
  view?: TaskView;
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface NoteFilter {
  view?: NoteView;
  tag?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResults {
  tasks: Task[];
  notes: NoteSummary[];
}

export interface MemexSettings {
  mcpAccessMode: McpAccessMode;
  mcpTaskWrite: boolean;
  mcpNoteWrite: boolean;
  closeToTray: boolean;
  autoLaunch: boolean;
  quickCaptureHideOnBlur: boolean;
  theme: ThemeMode;
  lastBackupAt: number;
}

export type TaskTimerMode = 'countdown' | 'stopwatch';

/**
 * 任务计时器的状态。只活在内存里，但需要跨进程共享：
 * 主窗口持有权威状态，桌面小组件窗口只负责显示与转发操作。
 */
export interface TaskTimerState {
  taskId: string;
  taskTitle: string;
  mode: TaskTimerMode;
  /** 倒计时总时长（毫秒）；正计时为 null。 */
  durationMs: number | null;
  startedAt: number;
  accumulatedMs: number;
  running: boolean;
  finished: boolean;
}

export type TaskTimerAction = 'pause' | 'resume' | 'extend' | 'stop' | 'open';

export interface AppInfo {
  version: string;
  dbPath: string;
  userDataPath: string;
  mcpConfig: string;
}

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  tasks: unknown[];
  notes: unknown[];
  tags: unknown[];
  taskTags: unknown[];
  noteTags: unknown[];
  reportTemplates: unknown[];
  reports: unknown[];
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'no-release'
  | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  notes?: string;
  progress?: number;
  message?: string;
}
