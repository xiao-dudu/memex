import { useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronsDownUp, ListTodo, Plus, SearchX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Task, TaskStatus, TaskView } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { formatShortDate, isOverdue } from '../../lib/date';

const VIEW_TITLES: Record<TaskView, string> = {
  inbox: '全部任务',
  today: '今天',
  upcoming: '即将到期',
  done: '已完成',
  trash: '回收站',
};

const STATUS_FILTERS: { value: 'all' | TaskStatus; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
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
    updateTask,
    setListCollapsed,
    detailCollapsed,
    taskTag,
  } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [draft, setDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const cancelRenameRef = useRef(false);

  const beginRename = (task: Task) => {
    cancelRenameRef.current = false;
    setRenameDraft(task.title);
    setRenamingId(task.id);
  };

  const commitRename = (task: Task) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!next || next === task.title) return;
    void updateTask(task.id, { title: next });
  };

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
    <section className={cn(
        'flex flex-col border-r border-[var(--line)] bg-[var(--surface)]',
        detailCollapsed ? 'min-w-0 flex-1' : 'w-[var(--rail-list)] shrink-0',
      )}>
      <header
        className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line)] px-4"
        title={taskView === 'trash' ? '30 天后自动清理' : '点击任务查看详情，空格键可快速完成'}
      >
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{VIEW_TITLES[taskView]}</h1>
        <span className="rounded-md bg-[var(--hover)] px-2 py-0.5 text-[12px] tabular-nums text-[var(--muted)]">
          {visibleTasks.length}
        </span>
        <span className="flex-1" />
        {!detailCollapsed ? (
          <button
            onClick={() => setListCollapsed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            title="折叠列表"
          >
            <ChevronsDownUp size={14} />
          </button>
        ) : null}
      </header>

      {taskView !== 'trash' && taskView !== 'done' ? (
        <div className="border-b border-[var(--line)] px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 shadow-sm">
            <Plus size={14} className="text-[var(--faint)]" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitDraft();
              }}
              placeholder="快速添加任务，回车创建"
              className="h-6 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--faint)]"
            />
          </div>
        </div>
      ) : null}

      {taskView !== 'trash' && taskView !== 'done' ? (
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-3 py-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              'h-6 rounded-md px-2 text-[12px] transition',
              statusFilter === filter.value
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
      ) : null}

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-[68px] animate-pulse rounded-xl bg-[var(--hover)]" />
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-sm">
              {taskView === 'inbox' ? <ListTodo size={20} /> : <SearchX size={20} />}
            </div>
            <p className="text-[13px] font-medium">
              {taskTag ? `「${taskTag}」下没有任务` : taskView === 'inbox' ? '还没有任务' : '这里还没有内容'}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--faint)]">
              {taskTag
                ? '再次点击左侧标签即可取消筛选。'
                : taskView === 'trash'
                  ? '删除的任务会在这里保留 30 天。'
                  : '在上方输入框写下第一件事。'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleTasks.map((task) => {
              const due = task.dueAt ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 text-[12px]',
                    isOverdue(task.dueAt, task.status) ? 'font-medium text-red-500' : 'text-[var(--faint)]',
                  )}
                >
                  <CalendarClock size={11} />
                  {formatShortDate(task.dueAt)}
                </span>
              ) : null;
              const tagBadges = task.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[12px] text-[var(--muted)]">
                  {tag}
                </span>
              ));
              const noteRef = task.noteTitle ? (
                <span className="max-w-[180px] truncate text-[12px] text-[var(--faint)]">↗ {task.noteTitle}</span>
              ) : null;

              return (
              <motion.div
                layout="position"
                key={task.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                role="button"
                tabIndex={0}
                onClick={() => selectTask(task.id)}
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement).closest('[data-rename-ignore]')) return;
                  beginRename(task);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectTask(task.id);
                  } else if (event.key === 'F2') {
                    event.preventDefault();
                    beginRename(task);
                  }
                }}
                className={cn(
                  'group mb-0.5 flex w-full gap-3 rounded-xl px-3 text-left transition-colors',
                  detailCollapsed ? 'py-4' : 'py-3',
                  activeTask?.id === task.id ? 'bg-[var(--surface-2)] shadow-sm ring-1 ring-[var(--line)]' : 'hover:bg-[var(--hover)]',
                )}
              >
                <span data-rename-ignore className="flex">
                  <Checkbox
                    checked={task.status === 'done'}
                    onChange={() => void toggleTask(task)}
                    label={`完成 ${task.title}`}
                    className="mt-1"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                      title={task.priority === 'high' ? '高优先级' : task.priority === 'medium' ? '中优先级' : '低优先级'}
                    />
                    {renamingId === task.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        aria-label="任务标题"
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelRenameRef.current = true;
                            event.currentTarget.blur();
                          }
                        }}
                        onBlur={() => {
                          if (cancelRenameRef.current) {
                            cancelRenameRef.current = false;
                            setRenamingId(null);
                            return;
                          }
                          commitRename(task);
                        }}
                        className="min-w-0 flex-1 rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[13px] text-[var(--ink)] outline-none ring-1 ring-[var(--accent)]"
                      />
                    ) : (
                      <span className={cn('truncate text-[13px]', task.status === 'done' ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]')}>
                        {task.title}
                      </span>
                    )}
                    {detailCollapsed ? (
                      <span className="ml-auto flex shrink-0 items-center gap-3 pl-4">
                        {tagBadges}
                        {noteRef}
                        {due}
                      </span>
                    ) : null}
                  </div>
                  {task.description ? (
                    <p className={cn('mt-1 text-[12px] text-[var(--faint)]', detailCollapsed ? 'line-clamp-2' : 'truncate')}>
                      {task.description}
                    </p>
                  ) : null}
                  {!detailCollapsed ? (
                    <div className="mt-2 flex items-center gap-2">
                      {due}
                      {tagBadges}
                      {noteRef}
                    </div>
                  ) : null}
                </div>
              </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

    </section>
  );
}
