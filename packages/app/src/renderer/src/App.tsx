import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar } from './components/layout/Sidebar';
import { SplashScreen } from './components/layout/SplashScreen';
import { TitleBar } from './components/layout/TitleBar';
import { TaskList } from './components/tasks/TaskList';
import { TaskDetail } from './components/tasks/TaskDetail';
import { NoteList } from './components/notes/NoteList';
import { NoteDetail } from './components/notes/NoteDetail';
import { ReportList } from './components/reports/ReportList';
import { ReportWorkspace } from './components/reports/ReportWorkspace';
import { SearchPalette } from './components/search/SearchPalette';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { useAppStore } from './store/useAppStore';
import { useReportStore } from './store/useReportStore';

const SPLASH_MIN_DURATION = 1150;

export default function App() {
  const {
    module,
    tasks,
    notes,
    activeTask,
    activeNote,
    settings,
    listCollapsed,
    detailCollapsed,
    setDetailCollapsed,
    bootstrap,
    refresh,
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
  const startNewReport = useReportStore((state) => state.startNewReport);

  const [showSplash, setShowSplash] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const started = Date.now();
    void bootstrap().finally(() => {
      // 数据可能比动画先好，也可能更慢；取两者较晚的那个，避免开场被硬切成半截
      const remain = Math.max(0, SPLASH_MIN_DURATION - (Date.now() - started));
      window.setTimeout(() => setShowSplash(false), remain);
    });
  }, [bootstrap]);

  // MCP 客户端在外部写库后界面不会自动更新，窗口重新获得焦点时补一次读取。
  // refresh() 会整份覆盖 tasks/notes，所以用 ref 挡住连点导致的并发覆盖。
  const refreshing = useRef(false);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || refreshing.current) return;
      refreshing.current = true;
      void refresh().finally(() => {
        refreshing.current = false;
      });
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    document.documentElement.dataset.theme = theme;
    void window.memex.window.setTheme(theme);
  }, [settings?.theme]);

  useEffect(() => {
    if (module === 'notes' && !activeNote && notes[0]) void selectNote(notes[0].id, { preserveLayout: true });
    if (module === 'tasks' && !activeTask && tasks[0]) selectTask(tasks[0].id, { preserveLayout: true });
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
        else if (module === 'reports') startNewReport();
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
  }, [module, searchOpen, settingsOpen, setSearchOpen, setSettingsOpen, createTask, createNote, startNewReport]);

  const createCurrent = () => {
    if (module === 'tasks') void createTask('未命名任务');
    else if (module === 'notes') void createNote();
    else startNewReport();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <TitleBar
        onSearch={() => setSearchOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => useAppStore.getState().setSidebarCollapsed(!useAppStore.getState().sidebarCollapsed)}
        onToggleDetail={() => setDetailCollapsed(!detailCollapsed)}
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
              className={detailCollapsed ? 'flex min-h-0 min-w-0 flex-1' : 'flex min-h-0'}
            >
              {module === 'tasks' ? <TaskList /> : module === 'notes' ? <NoteList /> : <ReportList />}
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
                onClick={createCurrent}
                className="mt-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--accent)]"
                title="新建"
              >
                <Plus size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {detailCollapsed ? (
          <div className="flex w-8 shrink-0 flex-col items-center border-l border-[var(--line)] bg-[var(--surface)] py-3">
            <button
              onClick={() => setDetailCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              title="展开详情"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        ) : module === 'tasks' ? (
          <TaskDetail />
        ) : module === 'notes' ? (
          <NoteDetail />
        ) : (
          <ReportWorkspace />
        )}
      </div>

      <SearchPalette />
      <SettingsDialog />

      <AnimatePresence>{showSplash ? <SplashScreen key="splash" /> : null}</AnimatePresence>
    </div>
  );
}
