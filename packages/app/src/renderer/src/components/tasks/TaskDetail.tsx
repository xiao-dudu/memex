import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  Circle,
  CircleDashed,
  FileText,
  Link2,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Task, TaskPriority, TaskStatus } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/button';
import { DatePicker } from '../ui/date-picker';
import { Select } from '../ui/select';
import { cn } from '../ui/utils';
import { formatDue } from '../../lib/date';
import { TaskDescriptionDrawer } from './TaskDescriptionDrawer';
import { TaskTimerControl } from './TaskTimerControl';

const STATUS_META: { value: TaskStatus; label: string; icon: typeof Circle }[] = [
  { value: 'todo', label: '待办', icon: Circle },
  { value: 'doing', label: '进行中', icon: CircleDashed },
  { value: 'done', label: '完成', icon: Check },
];

const PROPERTIES_COLLAPSED_KEY = 'memex:task-properties-collapsed';

const PRIORITY_META: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'high', label: '高', color: '#c2413a' },
  { value: 'medium', label: '中', color: '#c08a2e' },
  { value: 'low', label: '低', color: '#7d8b90' },
];

export function TaskDetail() {
  const { activeTask, notes, updateTask, deleteTask, restoreTask, purgeTask, setListCollapsed } = useAppStore();
  const [title, setTitle] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(readPropertiesCollapsed);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const taskIdRef = useRef<string | null>(null);
  // 上一次“已落库”的标题。用来区分“本地草稿被用户改过”和“外部把库里的值改了”。
  const lastSavedTitleRef = useRef('');

  useEffect(() => {
    if (!activeTask) return;

    if (activeTask.id !== taskIdRef.current) {
      taskIdRef.current = activeTask.id;
      lastSavedTitleRef.current = activeTask.title;
      setTitle(activeTask.title);
      setSaveState('idle');
      setDescriptionOpen(false);
      return;
    }

    // 同一条任务被外部改写（列表里重命名、MCP 写入）：草稿干净时才同步过来。
    // 不同步的话，下面的自动保存会把旧标题写回库里，把外面的修改覆盖掉。
    const saved = lastSavedTitleRef.current;
    if (activeTask.title !== saved) {
      lastSavedTitleRef.current = activeTask.title;
      setTitle((current) => (current === saved ? activeTask.title : current));
    }
  }, [activeTask]);

  useEffect(() => {
    if (!activeTask) return;
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === activeTask.title) return;

    const timer = setTimeout(() => {
      setSaveState('saving');
      void updateTask(activeTask.id, { title: nextTitle }).then(() => {
        lastSavedTitleRef.current = nextTitle;
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1400);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [title, activeTask, updateTask]);

  if (!activeTask) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg)] paper-grain">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-soft">
          <FileText size={22} />
        </div>
        <p className="text-[15px] font-medium">选择一条任务</p>
        <p className="mt-1 text-[12px] text-[var(--faint)]">或者按 Ctrl+N 新建一条</p>
      </div>
    );
  }

  const task = activeTask;
  const isTrash = taskViewIsTrash(task);
  const statusLabel = STATUS_META.find((meta) => meta.value === task.status)?.label ?? '';
  const priorityLabel = PRIORITY_META.find((meta) => meta.value === task.priority)?.label ?? '';
  const summary = [statusLabel, priorityLabel, task.dueAt ? formatDue(task.dueAt) : null, ...task.tags]
    .filter(Boolean)
    .join(' · ');
  const descriptionText = task.description?.trim() ?? '';
  // 超过三行或明显超长才提示可展开，短描述不打扰。
  const descriptionOverflow = descriptionText.length > 96 || descriptionText.split('\n').length > 3;

  const toggleProperties = () => {
    setPropertiesCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(PROPERTIES_COLLAPSED_KEY, String(next));
      } catch {
        // Private browsing or a locked-down renderer should not block the UI.
      }
      return next;
    });
  };

  const addTag = async () => {
    const clean = tagDraft.trim();
    if (!clean || task.tags.includes(clean)) {
      setTagDraft('');
      return;
    }
    setTagDraft('');
    await updateTask(task.id, { tags: [...task.tags, clean] });
  };

  return (
    <motion.section
      key={task.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]"
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-12 py-8">
        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={() => setListCollapsed(false)}
            className="rounded-md px-2 py-1 text-[12px] text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] lg:hidden"
          >
            返回列表
          </button>
          <div className="flex items-center gap-2 text-[12px] text-[var(--faint)]">
            <span>任务</span>
            <span>/</span>
            <span>{task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办'}</span>
          </div>
          <span className="flex-1" />
          <TaskTimerControl task={task} />
          {saveState !== 'idle' ? (
            <span className="text-[12px] text-[var(--faint)]">{saveState === 'saving' ? '保存中…' : '已保存'}</span>
          ) : null}
        </div>

        <div className="relative">
          <button
            onClick={() => void updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })}
            className={cn(
              'absolute -left-9 top-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all',
              task.status === 'done'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line-strong)] text-transparent hover:border-[var(--accent)]',
            )}
          >
            <Check size={13} strokeWidth={3} />
          </button>
          <textarea
            rows={1}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                (event.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
            className={cn(
              'min-h-[42px] w-full resize-none bg-transparent font-serif text-[24px] font-semibold leading-tight tracking-[-0.02em] outline-none placeholder:text-[var(--faint)]',
              task.status === 'done' ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]',
            )}
            placeholder="任务标题"
          />
        </div>

        <button
          type="button"
          onClick={() => setDescriptionOpen(true)}
          aria-label="打开任务描述"
          className="group -mx-3 mt-5 flex w-[calc(100%+24px)] items-start gap-2 rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-[var(--line)] hover:bg-[var(--surface)]"
        >
          <span className="min-w-0 flex-1">
            {descriptionText ? (
              <span className="line-clamp-3 whitespace-pre-wrap font-serif text-[15px] leading-7 text-[var(--ink)]">
                {descriptionText}
              </span>
            ) : (
              <span className="font-serif text-[15px] leading-7 text-[var(--faint)]">补充描述、上下文或下一步…</span>
            )}
          </span>
          {descriptionOverflow ? (
            <span className="mt-1 shrink-0 text-[12px] text-[var(--faint)] opacity-0 transition group-hover:opacity-100">
              展开
            </span>
          ) : null}
        </button>

        <div className="mt-6 border-t border-[var(--line)]">
          <button
            type="button"
            aria-expanded={!propertiesCollapsed}
            aria-controls="task-properties"
            aria-label={propertiesCollapsed ? '展开任务属性' : '收起任务属性'}
            onClick={toggleProperties}
            className="group flex w-full items-center gap-3 py-3 text-left"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-[12px] text-[var(--muted)]">{summary}</span>
            </div>
            <span className="shrink-0 text-[12px] text-[var(--faint)]">{propertiesCollapsed ? '属性' : '收起'}</span>
            <motion.span
              animate={{ rotate: propertiesCollapsed ? 0 : 180 }}
              transition={{ duration: 0.16 }}
              className="shrink-0 text-[var(--faint)]"
            >
              <ChevronDown size={14} />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {!propertiesCollapsed ? (
              <motion.div
                id="task-properties"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-5 pb-2 pt-2 text-[13px]">
                  <span className="pt-2 text-[12px] uppercase tracking-[0.12em] text-[var(--faint)]">状态</span>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_META.map((meta) => {
                      const Icon = meta.icon;
                      return (
                        <button
                          key={meta.value}
                          onClick={() => void updateTask(task.id, { status: meta.value })}
                          className={cn(
                            'inline-flex h-7 items-center gap-2 rounded-lg border px-3 text-[12px] transition',
                            task.status === meta.value
                              ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
                              : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
                          )}
                        >
                          <Icon size={12} />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  <span className="pt-2 text-[12px] uppercase tracking-[0.12em] text-[var(--faint)]">优先级</span>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITY_META.map((meta) => (
                      <button
                        key={meta.value}
                        onClick={() => void updateTask(task.id, { priority: meta.value })}
                        className={cn(
                          'inline-flex h-7 items-center gap-2 rounded-lg border px-3 text-[12px] transition',
                          task.priority === meta.value
                            ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] shadow-sm'
                            : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--hover)]',
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </button>
                    ))}
                  </div>

                  <span className="flex items-center gap-2 pt-2 text-[12px] uppercase tracking-[0.12em] text-[var(--faint)]">
                    <CalendarClock size={11} /> 截止
                  </span>
                  <DatePicker
                    value={task.dueAt}
                    onChange={(next) => void updateTask(task.id, { dueAt: next })}
                    withTime
                    label="截止时间"
                    placeholder="设置截止时间"
                  />

                  <span className="flex items-center gap-2 pt-2 text-[12px] uppercase tracking-[0.12em] text-[var(--faint)]">
                    <Tag size={11} /> 标签
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {task.tags.map((tag) => (
                      <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-md bg-[var(--surface-2)] px-2 text-[12px] text-[var(--muted)] ring-1 ring-[var(--line)]">
                        {tag}
                        <button onClick={() => void updateTask(task.id, { tags: task.tags.filter((item) => item !== tag) })} className="text-[var(--faint)] hover:text-red-500">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <div className="flex h-6 items-center gap-1 rounded-md border border-dashed border-[var(--line)] px-1.5">
                      <Plus size={10} className="text-[var(--faint)]" />
                      <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void addTag();
                        }}
                        placeholder="加标签"
                        className="w-16 bg-transparent text-[12px] outline-none placeholder:text-[var(--faint)]"
                      />
                    </div>
                  </div>

                  <span className="flex items-center gap-2 pt-2 text-[12px] uppercase tracking-[0.12em] text-[var(--faint)]">
                    <Link2 size={11} /> 关联笔记
                  </span>
                  <div>
                    <Select
                      value={task.noteId ?? ''}
                      onChange={(next) => void updateTask(task.id, { noteId: next || null })}
                      label="关联笔记"
                      className="max-w-[280px]"
                      options={[{ value: '', label: '未关联' }, ...notes.map((note) => ({ value: note.id, label: note.title }))]}
                    />
                    {task.noteInTrash ? <p className="mt-1 text-[12px] text-amber-600">关联笔记在回收站</p> : null}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="mt-10 flex items-center gap-2 border-t border-[var(--line)] pt-4">
          <span className="text-[12px] text-[var(--faint)]">
            创建于 {new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}
          </span>
          <span className="flex-1" />
          {isTrash ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void restoreTask(task.id)}>
                <RotateCcw size={13} /> 恢复
              </Button>
              <Button variant="danger" size="sm" onClick={() => void purgeTask(task.id)}>
                <Trash2 size={13} /> 彻底删除
              </Button>
            </>
          ) : (
            <button
              onClick={() => void deleteTask(task.id)}
              title="移到回收站"
              aria-label="移到回收站"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <TaskDescriptionDrawer task={task} open={descriptionOpen} onClose={() => setDescriptionOpen(false)} />
    </motion.section>
  );
}

function taskViewIsTrash(task: Task): boolean {
  return task.deletedAt !== null;
}

function readPropertiesCollapsed(): boolean {
  try {
    return localStorage.getItem(PROPERTIES_COLLAPSED_KEY) !== 'false';
  } catch {
    return true;
  }
}