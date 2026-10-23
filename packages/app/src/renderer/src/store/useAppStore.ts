import { create } from 'zustand';
import type {
  MemexSettings,
  Note,
  NoteCounts,
  NoteSummary,
  NoteView,
  SearchResults,
  Tag,
  Task,
  TaskCounts,
  TaskPatch,
  TaskView,
} from '@memex/shared';
import { emptyDocument } from '../lib/tiptap';

export type AppModule = 'tasks' | 'notes' | 'reports';

interface AppState {
  module: AppModule;
  taskView: TaskView;
  noteView: NoteView;
  taskTag: string | null;
  noteTag: string | null;
  tasks: Task[];
  notes: NoteSummary[];
  activeTask: Task | null;
  activeNote: Note | null;
  taskCounts: TaskCounts;
  noteCounts: NoteCounts;
  tags: Tag[];
  settings: MemexSettings | null;
  loading: boolean;
  error: string | null;
  sidebarCollapsed: boolean;
  listCollapsed: boolean;
  detailCollapsed: boolean;
  searchOpen: boolean;
  settingsOpen: boolean;

  bootstrap: () => Promise<void>;
  setModule: (module: AppModule) => void;
  setTaskView: (view: TaskView) => void;
  setNoteView: (view: NoteView) => void;
  refresh: () => Promise<void>;
  selectTask: (id: string | null, options?: { preserveLayout?: boolean }) => void;
  selectNote: (id: string | null, options?: { preserveLayout?: boolean }) => Promise<void>;
  openTask: (id: string) => Promise<void>;
  openNote: (id: string) => Promise<void>;
  setTaskTag: (tag: string | null) => void;
  setNoteTag: (tag: string | null) => void;
  createTask: (title: string) => Promise<Task>;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  purgeTask: (id: string) => Promise<void>;
  createNote: () => Promise<Note>;
  updateNote: (id: string, patch: { contentJson?: string; plainText?: string; title?: string; isPinned?: boolean; tags?: string[] }) => Promise<void>;
  togglePin: (note: NoteSummary) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  purgeNote: (id: string) => Promise<void>;
  search: (query: string) => Promise<SearchResults>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setListCollapsed: (collapsed: boolean) => void;
  setDetailCollapsed: (collapsed: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  updateSettings: (patch: Partial<MemexSettings>) => Promise<void>;
}

const EMPTY_TASK_COUNTS: TaskCounts = { inbox: 0, today: 0, upcoming: 0, done: 0, trash: 0 };
const EMPTY_NOTE_COUNTS: NoteCounts = { all: 0, pinned: 0, trash: 0 };

const LAYOUT_KEYS = {
  sidebar: 'memex:layout-sidebar',
  list: 'memex:layout-list',
  detail: 'memex:layout-detail',
} as const;

function readLayout(key: string, fallback = false): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function writeLayout(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 隐私模式或受限环境不该阻塞布局切换
  }
}

const initialSidebarCollapsed = readLayout(LAYOUT_KEYS.sidebar);
const initialDetailCollapsed = readLayout(LAYOUT_KEYS.detail);
// 列表与详情同时折叠会剩两条空轨道，归一化：详情折叠时列表必定展开
const initialListCollapsed = initialDetailCollapsed ? false : readLayout(LAYOUT_KEYS.list);

export const useAppStore = create<AppState>((set, get) => ({
  module: 'tasks',
  taskView: 'inbox',
  noteView: 'all',
  taskTag: null,
  noteTag: null,
  tasks: [],
  notes: [],
  activeTask: null,
  activeNote: null,
  taskCounts: EMPTY_TASK_COUNTS,
  noteCounts: EMPTY_NOTE_COUNTS,
  tags: [],
  settings: null,
  loading: true,
  error: null,
  sidebarCollapsed: initialSidebarCollapsed,
  listCollapsed: initialListCollapsed,
  detailCollapsed: initialDetailCollapsed,
  searchOpen: false,
  settingsOpen: false,

  async bootstrap() {
    try {
      const [tasks, notes, tags, taskCounts, noteCounts, settings] = await Promise.all([
        window.memex.tasks.list({ view: 'inbox' }),
        window.memex.notes.list({ view: 'all' }),
        window.memex.tags.list(),
        window.memex.tasks.counts(),
        window.memex.notes.counts(),
        window.memex.settings.get(),
      ]);
      set({
        tasks,
        notes,
        tags,
        taskCounts,
        noteCounts,
        settings,
        loading: false,
        activeTask: get().activeTask ?? tasks[0] ?? null,
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  setModule(module) {
    set({ module });
  },

  setTaskView(view) {
    set({ taskView: view, module: 'tasks', listCollapsed: false });
    void get().refresh();
  },

  setNoteView(view) {
    set({ noteView: view, module: 'notes', listCollapsed: false });
    void get().refresh();
  },

  async refresh() {
    const { taskView, noteView, taskTag, noteTag } = get();
    try {
      const [tasks, notes, tags, taskCounts, noteCounts] = await Promise.all([
        window.memex.tasks.list({ view: taskView, tag: taskTag ?? undefined }),
        window.memex.notes.list({ view: noteView, tag: noteTag ?? undefined }),
        window.memex.tags.list(),
        window.memex.tasks.counts(),
        window.memex.notes.counts(),
      ]);
      const activeTaskId = get().activeTask?.id;
      const activeNoteId = get().activeNote?.id;
      set({
        tasks,
        notes,
        tags,
        taskCounts,
        noteCounts,
        activeTask:
          tasks.find((task) => task.id === activeTaskId) ??
          (get().module === 'tasks' ? tasks[0] ?? null : get().activeTask),
        activeNote:
          get().activeNote && activeNoteId === get().activeNote?.id ? get().activeNote : get().activeNote,
        error: null,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  selectTask(id, options) {
    const task = get().tasks.find((item) => item.id === id) ?? null;
    set(
      options?.preserveLayout
        ? { activeTask: task }
        : { activeTask: task, listCollapsed: false, detailCollapsed: false },
    );
  },

  async openTask(id) {
    const task = await window.memex.tasks.get(id);
    if (!task) return;
    set({ module: 'tasks', activeTask: task, listCollapsed: false, detailCollapsed: false });
  },

  async openNote(id) {
    const note = await window.memex.notes.get(id);
    if (!note) return;
    set({ module: 'notes', activeNote: note, listCollapsed: false, detailCollapsed: false });
  },

  setTaskTag(tag) {
    set({ module: 'tasks', taskTag: tag, listCollapsed: false });
    void get().refresh();
  },

  setNoteTag(tag) {
    set({ module: 'notes', noteTag: tag, listCollapsed: false });
    void get().refresh();
  },

  async selectNote(id, options) {
    if (!id) {
      set({ activeNote: null });
      return;
    }
    const note = await window.memex.notes.get(id);
    set(
      options?.preserveLayout
        ? { activeNote: note }
        : { activeNote: note, listCollapsed: false, detailCollapsed: false },
    );
  },

  async createTask(title) {
    const task = await window.memex.tasks.create({ title });
    set({ module: 'tasks', taskView: 'inbox', activeTask: task, detailCollapsed: false });
    await get().refresh();
    set({ activeTask: task });
    return task;
  },

  async updateTask(id, patch) {
    const updated = await window.memex.tasks.update(id, patch);
    set({
      tasks: get().tasks.map((task) => (task.id === id ? updated : task)),
      activeTask: get().activeTask?.id === id ? updated : get().activeTask,
    });
  },

  async toggleTask(task) {
    await get().updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
    await get().refresh();
  },

  async deleteTask(id) {
    await window.memex.tasks.remove(id);
    if (get().activeTask?.id === id) set({ activeTask: null });
    await get().refresh();
  },

  async restoreTask(id) {
    await window.memex.tasks.restore(id);
    await get().refresh();
  },

  async purgeTask(id) {
    await window.memex.tasks.purge(id);
    if (get().activeTask?.id === id) set({ activeTask: null });
    await get().refresh();
  },

  async createNote() {
    const note = await window.memex.notes.create({ contentJson: emptyDocument(), plainText: '' });
    set({ module: 'notes', noteView: 'all', activeNote: note, detailCollapsed: false });
    await get().refresh();
    set({ activeNote: note });
    return note;
  },

  async updateNote(id, patch) {
    const updated = await window.memex.notes.update(id, patch);
    set({
      activeNote: get().activeNote?.id === id ? updated : get().activeNote,
      notes: get().notes.map((note) =>
        note.id === id
          ? {
              id: updated.id,
              title: updated.title,
              excerpt: updated.excerpt,
              isPinned: updated.isPinned,
              createdAt: updated.createdAt,
              updatedAt: updated.updatedAt,
              deletedAt: updated.deletedAt,
              tags: updated.tags,
            }
          : note,
      ),
    });
  },

  async togglePin(note) {
    await window.memex.notes.update(note.id, { isPinned: !note.isPinned });
    await get().refresh();
  },

  async deleteNote(id) {
    await window.memex.notes.remove(id);
    if (get().activeNote?.id === id) set({ activeNote: null });
    await get().refresh();
  },

  async restoreNote(id) {
    await window.memex.notes.restore(id);
    await get().refresh();
  },

  async purgeNote(id) {
    await window.memex.notes.purge(id);
    if (get().activeNote?.id === id) set({ activeNote: null });
    await get().refresh();
  },

  async search(query) {
    return window.memex.search(query, 20);
  },

  setSidebarCollapsed(collapsed) {
    writeLayout(LAYOUT_KEYS.sidebar, collapsed);
    set({ sidebarCollapsed: collapsed });
  },

  setListCollapsed(collapsed) {
    writeLayout(LAYOUT_KEYS.list, collapsed);
    set({ listCollapsed: collapsed });
  },

  setDetailCollapsed(collapsed) {
    writeLayout(LAYOUT_KEYS.detail, collapsed);
    set({ detailCollapsed: collapsed, ...(collapsed ? { listCollapsed: false } : {}) });
  },

  setSearchOpen(open) {
    set({ searchOpen: open });
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },

  async updateSettings(patch) {
    const settings = await window.memex.settings.update(patch);
    set({ settings });
  },
}));

