import { useState } from 'react';
import { Bell, Plus, Settings2, Users } from 'lucide-react';
import { deriveTeamTaskState } from '@memex/shared/team';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';
import { Select } from '../ui/select';
import { TeamTaskEditor } from './TeamTaskEditor';

interface Props {
  onOpenManagement(): void;
  onOpenNotifications(): void;
}

const STATE_LABEL = {
  in_progress: '进行中',
  completed: '已完成',
  ended_with_closed: '已结束',
  archived: '已归档',
} as const;

const VIEWS = [
  { value: 'all', label: '全部任务' },
  { value: 'mine', label: '我的任务' },
  { value: 'pending_review', label: '待我验收' },
  { value: 'overdue', label: '逾期' },
  { value: 'archived', label: '已归档' },
] as const;

export function TeamTaskList({ onOpenManagement, onOpenNotifications }: Props) {
  const {
    tasks,
    view,
    session,
    members,
    memberFilter,
    notifications,
    setView,
    setMemberFilter,
    selectTask,
    activeTask,
  } = useTeamStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const unread = notifications.filter((item) => item.readAt === null).length;
  const activeMembers = members.filter((item) => item.removedAt === null);

  return (
    <section className="flex w-[var(--rail-list)] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      <header className="flex h-14 items-center gap-2 border-b border-[var(--line)] px-4">
        <h1 className="text-[15px] font-semibold">团队任务</h1>
        <span className="rounded bg-[var(--hover)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          {tasks.length}
        </span>
        <span className="flex-1" />
        <button
          onClick={onOpenNotifications}
          aria-label="团队通知"
          className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--hover)]"
        >
          <Bell size={15} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
          ) : null}
        </button>
        {session.role === 'leader' ? (
          <button
            onClick={onOpenManagement}
            aria-label="团队管理"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--hover)]"
          >
            <Settings2 size={15} />
          </button>
        ) : null}
      </header>
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] px-2 py-2">
        {VIEWS.filter((item) => session.role === 'leader' || item.value !== 'pending_review').map(
          (item) => (
            <button
              key={item.value}
              onClick={() => void setView(item.value)}
              className={
                item.value === view
                  ? 'rounded-md bg-[var(--accent-soft)] px-2 py-1 text-[11px] text-[var(--accent)]'
                  : 'rounded-md px-2 py-1 text-[11px] text-[var(--muted)]'
              }
            >
              {item.label}
            </button>
          ),
        )}
      </div>
      {session.role === 'leader' ? (
        <div className="space-y-2 border-b border-[var(--line)] p-3">
          <Select
            label="按成员"
            value={memberFilter ?? ''}
            options={[
              { value: '', label: '全部成员' },
              ...activeMembers.map((item) => ({ value: item.id, label: item.displayName })),
            ]}
            onChange={(value) => void setMemberFilter(value || null)}
          />
          <Button size="sm" className="w-full" onClick={() => setEditorOpen(true)}>
            <Plus size={14} /> 新建团队任务
          </Button>
        </div>
      ) : null}
      <div className="thin-scroll flex-1 overflow-y-auto p-2">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => void selectTask(task.id)}
            className={
              task.id === activeTask?.id
                ? 'mb-1 w-full rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-left'
                : 'mb-1 w-full rounded-xl border border-transparent p-3 text-left hover:bg-[var(--hover)]'
            }
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium">{task.title}</span>
              <span className="ml-auto text-[10px] text-[var(--muted)]">
                {STATE_LABEL[deriveTeamTaskState(task)]}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--faint)]">
              <Users size={11} /> {task.assignees.length} 人执行
              {task.dueAt ? <span>· {new Date(task.dueAt).toLocaleDateString('zh-CN')}</span> : null}
            </div>
          </button>
        ))}
      </div>
      <TeamTaskEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    </section>
  );
}
