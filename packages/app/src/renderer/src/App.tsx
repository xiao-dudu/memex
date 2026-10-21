import { useEffect } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar } from './components/layout/Sidebar';
import { TitleBar } from './components/layout/TitleBar';
import { TaskList } from './components/tasks/TaskList';
import { TaskDetail } from './components/tasks/TaskDetail';
import { NoteList } from './components/notes/NoteList';
import { NoteDetail } from './components/notes/NoteDetail';
import { SearchPalette } from './components/search/SearchPalette';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const {
    module,
    tasks,
    notes,
    activeTask,
    activeNote,
    settings,
    listCollapsed,
    bootstrap,
    selectTask,
    selectNote,
    setListCollapsed,
    createTask,
    createNote,
    setSearchOpen,
    setSettingsOpen,
    searchOpen,
    settingsOpen,
  } = useAppStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    document.documentElement.dataset.theme = theme;
    void window.memex.window.setTheme(theme);
  }, [settings?.theme]);

  useEffect(() => {
    if (module === 'notes' && !activeNote && notes[0]) void selectNote(notes[0].id);
    if (module === 'tasks' && !activeTask && tasks[0]) selectTask(tasks[0].id);
  }, [module, notes, tasks, activeNote, activeTask, selectNote, selectTask]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(!searchOpen);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (event.shiftKey) void createNote();
        else if (module === 'tasks') void createTask('未命名任务');
        else void createNote();
        return;
      }
      if (event.key === 'Escape' && !editing) {
        if (searchOpen) setSearchOpen(false);
        if (settingsOpen) setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [module, searchOpen, settingsOpen, setSearchOpen, setSettingsOpen, createTask, createNote]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <TitleBar
        onSearch={() => setSearchOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => useAppStore.getState().setSidebarCollapsed(!useAppStore.getState().sidebarCollapsed)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <AnimatePresence initial={false} mode="popLayout">
          {!listCollapsed ? (
            <motion.div
              key={`list-${module}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.16 }}
              className="flex min-h-0"
            >
              {module === 'tasks' ? <TaskList /> : <NoteList />}
            </motion.div>
          ) : (
            <motion.div
              key="list-rail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex w-8 shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--surface)] py-3"
            >
              <button
                onClick={() => setListCollapsed(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                title="展开列表"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => void (module === 'tasks' ? createTask('未命名任务') : createNote())}
                className="mt-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--accent)]"
                title="新建"
              >
                <Plus size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {module === 'tasks' ? <TaskDetail /> : <NoteDetail />}
      </div>

      <SearchPalette />
      <SettingsDialog />
    </div>
  );
}
