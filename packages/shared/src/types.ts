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
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: number | null;
  noteId?: string | null;
  tags?: string[];
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
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
  closeToTray: boolean;
  autoLaunch: boolean;
  quickCaptureHideOnBlur: boolean;
  theme: ThemeMode;
  lastBackupAt: number;
}

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
