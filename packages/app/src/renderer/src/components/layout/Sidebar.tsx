import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
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

const MODULES: { id: 'tasks' | 'notes' | 'reports'; label: string; icon: typeof Inbox }[] = [
  { id: 'tasks', label: '任务', icon: CheckCircle2 },
  { id: 'notes', label: '笔记', icon: StickyNote },
  { id: 'reports', label: '周报', icon: FileText },
];

const CREATE_LABELS: Record<'tasks' | 'notes' | 'reports', string> = {
  tasks: '新建任务',
  notes: '新建笔记',
  reports: '新建周报',
};

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
    setSettingsOpen,
    createTask,
    createNote,
  } = useAppStore();
  const startNewReport = useReportStore((state) => state.startNewReport);

  const createIn = (target: 'tasks' | 'notes' | 'reports') => {
    if (target === 'tasks') {
      void createTask('未命名任务');
      return;
    }
    if (target === 'notes') {
      void createNote();
      return;
    }
    setModule('reports');
    startNewReport();
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
    <aside className="flex w-[var(--rail-sidebar)] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--sidebar)]">
      <div className="flex flex-col gap-0.5 px-3 pt-3">
        {MODULES.map((item) => {
          const Icon = item.icon;
          const active = module === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                'group relative flex h-8 items-center rounded-lg transition-colors',
                active ? '' : 'hover:bg-[var(--hover)]',
              )}
            >
              {active ? (
                <span className="absolute left-0 top-2 h-4 w-[2px] rounded-full bg-[var(--accent)]" aria-hidden="true" />
              ) : null}
              <button
                onClick={() => setModule(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-1 items-center gap-2 rounded-lg px-3 text-[13px] transition-colors',
                  active ? 'font-medium text-[var(--ink)]' : 'text-[var(--muted)] group-hover:text-[var(--ink)]',
                )}
              >
                <Icon size={14} className={active ? 'text-[var(--accent)]' : ''} />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
              <button
                onClick={() => createIn(item.id)}
                title={CREATE_LABELS[item.id]}
                aria-label={CREATE_LABELS[item.id]}
                className={cn(
                  'mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--surface-2)] hover:text-[var(--accent)] focus-visible:opacity-100',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                )}
              >
                <Plus size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <nav className="thin-scroll mt-4 flex-1 overflow-y-auto px-3">
        {module === 'reports' ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
              <FileText size={14} className="text-[var(--accent)]" />
              周报工作台
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[var(--faint)]">
              在中间列表切换报告与模板；报告保存生成时的完整快照。
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between px-3">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">视图</span>
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
                      'group flex h-8 w-full items-center gap-2 rounded-lg px-3 text-[13px] transition-colors',
                      active ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
                    )}
                  >
                    <Icon size={14} className={active ? 'text-[var(--accent)]' : ''} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {count > 0 ? (
                      <span className={cn('min-w-5 rounded-md px-1.5 py-0.5 text-center text-[12px] tabular-nums', active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--faint)]')}>
                        {count}
                      </span>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>

            <div className="mb-2 mt-6 flex items-center gap-3 px-3">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">标签</span>
            </div>
            <div className="space-y-0.5">
              {tags.length === 0 ? (
                <p className="px-3 py-1 text-[12px] leading-5 text-[var(--faint)]" title="给任务或笔记加标签后，会出现在这里。">
                  还没有标签
                </p>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => (module === 'tasks' ? setTaskTag(tag.name) : setNoteTag(tag.name))}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition',
                      (module === 'tasks' ? taskTag : noteTag) === tag.name
                        ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)] shadow-sm'
                        : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 truncate text-left">{tag.name}</span>
                    <span className="text-[12px] tabular-nums text-[var(--faint)]">{(tag.taskCount ?? 0) + (tag.noteCount ?? 0)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-[var(--line)] p-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 flex-1 items-center gap-2 rounded-lg px-2 text-[13px] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
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
        <div className="mt-1 flex items-center gap-2 px-2 text-[12px] text-[var(--faint)]">
          <Layers size={11} />
          <span>数据保存在本地</span>
        </div>
      </div>
    </aside>
  );
}
