import { useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronsDownUp, Inbox, Plus, SearchX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Task, TaskStatus, TaskView } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { formatShortDate, isOverdue } from '../../lib/date';

const VIEW_TITLES: Record<TaskView, string> = {
  inbox: '收件箱',
  today: '今天',
  upcoming: '即将到期',
  done: '已完成',
  trash: '回收站',
};

const STATUS_FILTERS: { value: 'all' | TaskStatus; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
];

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: '#c2413a',
  medium: '#c08a2e',
  low: '#7d8b90',
};

export function TaskList() {
  const {
    tasks,
    taskView,
    activeTask,
    loading,
    selectTask,
    createTask,
    toggleTask,
    setListCollapsed,
  } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [draft, setDraft] = useState('');

  const visibleTasks = useMemo(
    () => (statusFilter === 'all' ? tasks : tasks.filter((task) => task.status === statusFilter)),
    [tasks, statusFilter],
  );

  const submitDraft = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await createTask(title);
  };

  return (
    <section className="flex w-[356px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      <header className="flex h-[62px] shrink-0 items-center gap-2 border-b border-[var(--line)] px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">{VIEW_TITLES[taskView]}</h1>
            <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--muted)]">
              {visibleTasks.length}
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-[var(--faint)]">
            {taskView === 'trash' ? '30 天后自动清理' : '点击任务查看详情，空格键可快速完成'}
          </p>
        </div>
        <button
          onClick={() => setListCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          title="折叠列表"
        >
          <ChevronsDownUp size={14} />
        </button>
      </header>

      {taskView !== 'trash' && taskView !== 'done' ? (
        <div className="border-b border-[var(--line)] px-3 py-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 shadow-sm">
            <Plus size={14} className="text-[var(--faint)]" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitDraft();
              }}
              placeholder="快速添加任务，回车创建"
              className="h-6 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[var(--faint)]"
            />
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-3 py-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              'h-6 rounded-md px-2 text-[10.5px] transition',
              statusFilter === filter.value
                ? 'bg-[var(--ink)] text-[var(--bg)]'
                : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-[68px] animate-pulse rounded-xl bg-[var(--hover)]" />
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-sm">
              {taskView === 'inbox' ? <Inbox size={20} /> : <SearchX size={20} />}
            </div>
            <p className="text-[13px] font-medium">{taskView === 'inbox' ? '收件箱是空的' : '这里还没有内容'}</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--faint)]">
              {taskView === 'trash' ? '删除的任务会在这里保留 30 天。' : '在上方输入框写下第一件事。'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleTasks.map((task) => (
              <motion.button
                layout="position"
                key={task.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                onClick={() => selectTask(task.id)}
                className={cn(
                  'group mb-0.5 flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors',
                  activeTask?.id === task.id ? 'bg-[var(--surface-2)] shadow-sm ring-1 ring-[var(--line)]' : 'hover:bg-[var(--hover)]',
                )}
              >
                <Checkbox
                  checked={task.status === 'done'}
                  onChange={() => void toggleTask(task)}
                  label={`完成 ${task.title}`}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                      title={task.priority === 'high' ? '高优先级' : task.priority === 'medium' ? '中优先级' : '低优先级'}
                    />
                    <span className={cn('truncate text-[12.5px]', task.status === 'done' ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]')}>
                      {task.title}
                    </span>
                  </div>
                  {task.description ? (
                    <p className="mt-1 truncate text-[11px] text-[var(--faint)]">{task.description}</p>
                  ) : null}
                  <div className="mt-1.5 flex items-center gap-2">
                    {task.dueAt ? (
                      <span className={cn('inline-flex items-center gap-1 text-[10px]', isOverdue(task.dueAt, task.status) ? 'font-medium text-red-500' : 'text-[var(--faint)]')}>
                        <CalendarClock size={10} />
                        {formatShortDate(task.dueAt)}
                      </span>
                    ) : null}
                    {task.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="rounded bg-[var(--hover)] px-1.5 py-0.5 text-[9.5px] text-[var(--muted)]">
                        {tag}
                      </span>
                    ))}
                    {task.noteTitle ? <span className="truncate text-[9.5px] text-[var(--faint)]">↗ {task.noteTitle}</span> : null}
                  </div>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>

      <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-[var(--line)] px-4 text-[10px] text-[var(--faint)]">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500/80" /> 高
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80" /> 中
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400/80" /> 低
        </span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => setListCollapsed(true)}>
          <ChevronLeft size={12} /> 聚焦
        </Button>
      </footer>
    </section>
  );
}
