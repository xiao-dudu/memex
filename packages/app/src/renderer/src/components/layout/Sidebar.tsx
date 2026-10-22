import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Hash,
  Inbox,
  Layers,
  PanelLeftClose,
  Pin,
  Plus,
  Settings2,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { NoteView, TaskView } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { useReportStore } from '../../store/useReportStore';
import { cn } from '../ui/utils';

const TASK_VIEWS: { view: TaskView; label: string; icon: typeof Inbox; countKey: 'inbox' | 'today' | 'upcoming' | 'done' | 'trash' }[] = [
  { view: 'inbox', label: '收件箱', icon: Inbox, countKey: 'inbox' },
  { view: 'today', label: '今天', icon: CalendarDays, countKey: 'today' },
  { view: 'upcoming', label: '即将到期', icon: Clock3, countKey: 'upcoming' },
  { view: 'done', label: '已完成', icon: CheckCircle2, countKey: 'done' },
  { view: 'trash', label: '回收站', icon: Trash2, countKey: 'trash' },
];

const NOTE_VIEWS: { view: NoteView; label: string; icon: typeof StickyNote; countKey: 'all' | 'pinned' | 'trash' }[] = [
  { view: 'all', label: '全部笔记', icon: StickyNote, countKey: 'all' },
  { view: 'pinned', label: '置顶', icon: Pin, countKey: 'pinned' },
  { view: 'trash', label: '回收站', icon: Trash2, countKey: 'trash' },
];

export function Sidebar() {
  const {
    module,
    taskView,
    noteView,
    taskCounts,
    noteCounts,
    taskTag,
    noteTag,
    tags,
    sidebarCollapsed,
    setModule,
    setTaskView,
    setNoteView,
    setTaskTag,
    setNoteTag,
    setSidebarCollapsed,
    setListCollapsed,
    setSettingsOpen,
    createTask,
    createNote,
  } = useAppStore();
  const startNewReport = useReportStore((state) => state.startNewReport);

  const createCurrent = () => {
    if (module === 'tasks') void createTask('未命名任务');
    else if (module === 'notes') void createNote();
    else {
      startNewReport();
      setListCollapsed(false);
    }
  };

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-[58px] shrink-0 flex-col items-center gap-2 border-r border-[var(--line)] bg-[var(--sidebar)] py-3">
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          title="展开侧栏"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setModule('tasks')}
          className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition', module === 'tasks' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]')}
          title="任务"
        >
          <CheckCircle2 size={18} />
        </button>
        <button
          onClick={() => setModule('notes')}
          className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition', module === 'notes' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]')}
          title="笔记"
        >
          <StickyNote size={18} />
        </button>
        <button
          onClick={() => setModule('reports')}
          className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition', module === 'reports' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]')}
          title="周报"
        >
          <FileText size={18} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          title="设置"
        >
          <Settings2 size={17} />
        </button>
      </aside>
    );
  }

  const views = module === 'tasks' ? TASK_VIEWS : NOTE_VIEWS;

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--sidebar)]">
      <div className="flex items-center gap-1.5 px-3 pt-3">
        <div className="flex flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)]/60 p-1">
          <button
            onClick={() => setModule('tasks')}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-all',
              module === 'tasks' ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
          >
            <CheckCircle2 size={12} />
            任务
          </button>
          <button
            onClick={() => setModule('notes')}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-all',
              module === 'notes' ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
          >
            <StickyNote size={12} />
            笔记
          </button>
          <button
            onClick={() => setModule('reports')}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-all',
              module === 'reports' ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
          >
            <FileText size={12} />
            周报
          </button>
        </div>
        <button
          onClick={createCurrent}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] shadow-sm transition hover:-translate-y-px hover:text-[var(--accent)]"
          title={module === 'tasks' ? '新建任务' : module === 'notes' ? '新建笔记' : '新建周报'}
        >
          <Plus size={16} />
        </button>
      </div>

      <nav className="thin-scroll mt-4 flex-1 overflow-y-auto px-2.5">
        {module === 'reports' ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--ink)]">
              <FileText size={14} className="text-[var(--accent)]" />
              周报工作台
            </div>
            <p className="mt-2 text-[10.5px] leading-5 text-[var(--faint)]">
              在中间列表切换报告与模板；报告保存生成时的完整快照。
            </p>
            <button
              onClick={startNewReport}
              className="mt-3 flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent-soft)] text-[10.5px] font-medium text-[var(--accent)] transition hover:brightness-98"
            >
              <Plus size={12} /> 新建周报
            </button>
          </div>
        ) : (
          <>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">视图</span>
            </div>
            <div className="space-y-0.5">
              {views.map((item) => {
                const Icon = item.icon;
                const active = module === 'tasks' ? taskView === item.view : noteView === item.view;
                const count =
                  module === 'tasks'
                    ? taskCounts[(item as (typeof TASK_VIEWS)[number]).countKey]
                    : noteCounts[(item as (typeof NOTE_VIEWS)[number]).countKey];
                return (
                  <motion.button
                    key={item.view}
                    onClick={() => void (module === 'tasks' ? setTaskView(item.view as TaskView) : setNoteView(item.view as NoteView))}
                    whileTap={{ scale: 0.985 }}
                    className={cn(
                      'group flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12.5px] transition-colors',
                      active ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
                    )}
                  >
                    <Icon size={14} className={active ? 'text-[var(--accent)]' : ''} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {count > 0 ? (
                      <span className={cn('min-w-5 rounded-md px-1.5 py-0.5 text-center text-[10px] tabular-nums', active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--faint)]')}>
                        {count}
                      </span>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>

            <div className="mb-1.5 mt-6 flex items-center gap-1.5 px-2">
              <Hash size={11} className="text-[var(--faint)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">标签</span>
            </div>
            <div className="space-y-0.5">
              {tags.length === 0 ? (
                <p className="px-2 py-1 text-[11px] leading-5 text-[var(--faint)]">给任务或笔记加标签后，会出现在这里。</p>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => (module === 'tasks' ? setTaskTag(tag.name) : setNoteTag(tag.name))}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] transition',
                      (module === 'tasks' ? taskTag : noteTag) === tag.name
                        ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)] shadow-sm'
                        : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 truncate text-left">{tag.name}</span>
                    <span className="text-[10px] tabular-nums text-[var(--faint)]">{(tag.taskCount ?? 0) + (tag.noteCount ?? 0)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-[var(--line)] p-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 flex-1 items-center gap-2 rounded-lg px-2 text-[12px] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <Settings2 size={14} />
            设置
          </button>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            title="折叠侧栏"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
        <div className="mt-1 flex items-center gap-1.5 px-2 text-[10px] text-[var(--faint)]">
          <Layers size={11} />
          <span>数据保存在本地</span>
        </div>
      </div>
    </aside>
  );
}
