import { useState } from 'react';
import type { TeamTaskEvent } from '@memex/shared';
import { Archive, Check, RotateCcw, X } from 'lucide-react';
import { canApproveAssignee, deriveTeamTaskState } from '@memex/shared/team';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';
import { canEditTeamTask, TeamTaskDescriptionDrawer } from './TeamTaskDescriptionDrawer';

const STATUS_LABEL = {
  todo: '待办',
  doing: '进行中',
  submitted: '待验收',
  approved: '已通过',
  closed: '已关闭',
} as const;

const STATE_LABEL = {
  in_progress: '进行中',
  completed: '已完成',
  ended_with_closed: '已结束',
  archived: '已归档',
} as const;

const EVENT_LABEL: Record<TeamTaskEvent['type'], string> = {
  created: '创建了任务',
  assigned: '分配了分项',
  started: '开始处理分项',
  submitted: '提交了分项验收',
  returned: '退回了分项',
  approved: '通过了分项',
  reopened: '重新打开了任务',
  archived: '归档了任务',
  closed: '关闭了分项',
};

export function TeamTaskDetail() {
  const {
    activeTask,
    session,
    members,
    notes,
    events,
    startAssignee,
    submitAssignee,
    reviewAssignee,
    reopenTask,
    archiveTask,
  } = useTeamStore();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [note, setNote] = useState('');

  if (!activeTask) {
    return (
      <section className="flex flex-1 items-center justify-center text-[12px] text-[var(--faint)]">
        选择一个团队任务
      </section>
    );
  }

  const leaders = members
    .filter((member) => member.role === 'leader' && member.removedAt === null)
    .map((member) => member.id);
  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.displayName ?? '未知成员';
  const mine = activeTask.assignees.find((item) => item.id === session.userId);
  const taskState = deriveTeamTaskState(activeTask);
  const archived = activeTask.archivedAt !== null;
  const terminal = taskState === 'completed' || taskState === 'ended_with_closed';
  const canEdit = canEditTeamTask(activeTask, session);
  const eventLabel = (item: TeamTaskEvent) => {
    const target = item.targetUserId ? `（${memberName(item.targetUserId)}）` : '';
    return `${memberName(item.actorId)} ${EVENT_LABEL[item.type]}${target}`;
  };

  const submit = async () => {
    if (!mine || !note.trim() || archived) return;
    await submitAssignee(activeTask.id, note.trim(), mine.version);
    setNote('');
  };

  return (
    <section className="thin-scroll min-w-0 flex-1 overflow-y-auto bg-[var(--surface-2)] p-5">
      <header className="border-b border-[var(--line)] pb-4">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-xl font-semibold">{activeTask.title}</h1>
          <span className="rounded-md bg-[var(--hover)] px-2 py-1 text-[11px]">
            {STATE_LABEL[taskState]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
          <span>
            {activeTask.priority === 'high'
              ? '高优先级'
              : activeTask.priority === 'medium'
                ? '中优先级'
                : '低优先级'}
          </span>
          {activeTask.dueAt ? (
            <span>截止 {new Date(activeTask.dueAt).toLocaleString('zh-CN', { hour12: false })}</span>
          ) : null}
          {activeTask.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
          <button
            type="button"
            className="text-[var(--accent)]"
            onClick={() => setDescriptionOpen(true)}
            aria-label="打开团队任务描述"
          >
            {canEdit ? '查看/编辑描述' : '查看描述'}
          </button>
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {activeTask.assignees.map((assignee) => {
          const canReview =
            !archived &&
            canApproveAssignee(activeTask, session.userId!, assignee.id, leaders) &&
            assignee.status === 'submitted';
          return (
            <article
              key={assignee.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"
            >
              <div className="flex items-center gap-2">
                <strong className="text-[13px]">{assignee.displayName}</strong>
                <span className="text-[11px] text-[var(--muted)]">
                  {STATUS_LABEL[assignee.status]}
                </span>
                {assignee.id === session.userId ? (
                  <span className="text-[10px] text-[var(--accent)]">我</span>
                ) : null}
                <span className="flex-1" />
                {canReview ? (
                  <>
                    <Button
                      size="sm"
                      aria-label="通过分项"
                      onClick={() =>
                        void reviewAssignee(
                          activeTask.id,
                          assignee.id,
                          'approve',
                          null,
                          assignee.version,
                        )
                      }
                    >
                      <Check size={13} /> 通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="退回分项"
                      onClick={() =>
                        void reviewAssignee(
                          activeTask.id,
                          assignee.id,
                          'return',
                          '请补充后重新提交',
                          assignee.version,
                        )
                      }
                    >
                      <X size={13} /> 退回
                    </Button>
                  </>
                ) : null}
              </div>
              {assignee.latestNote ? (
                <p className="mt-2 whitespace-pre-wrap text-[12px] text-[var(--muted)]">
                  最新备注：{assignee.latestNote}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {!archived && mine && mine.status === 'doing' ? (
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <label className="text-[12px] font-medium" htmlFor="team-progress-note">
            本次进度备注
          </label>
          <textarea
            id="team-progress-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 min-h-20 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[12px] outline-none"
            placeholder="说明完成内容或交付物"
          />
          <Button className="mt-2" disabled={!note.trim()} onClick={() => void submit()}>
            提交团队验收
          </Button>
        </div>
      ) : null}
      {!archived && mine?.status === 'todo' ? (
        <Button className="mt-4" onClick={() => void startAssignee(activeTask.id, mine.version)}>
          开始处理
        </Button>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section aria-label="进度备注历史">
          <h2 className="mb-2 text-[12px] font-semibold">进度备注历史</h2>
          <div className="space-y-2">
            {notes.map((item) => (
              <p key={item.id} className="rounded-lg bg-[var(--surface)] p-2 text-[12px]">
                <span className="font-medium text-[var(--ink)]">{memberName(item.userId)}</span>
                <span className="mx-1.5 text-[var(--faint)]">·</span>
                <span>{item.body}</span>
                <span className="ml-2 text-[10px] text-[var(--faint)]">
                  {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </span>
              </p>
            ))}
          </div>
        </section>
        <section aria-label="审计记录">
          <h2 className="mb-2 text-[12px] font-semibold">审计记录</h2>
          <div className="space-y-2">
            {events.map((item) => (
              <p key={item.id} className="text-[11px] text-[var(--muted)]">
                {eventLabel(item)} ·{' '}
                {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </p>
            ))}
          </div>
        </section>
      </div>

      {canEdit ? (
        <footer className="mt-8 flex gap-2 border-t border-[var(--line)] pt-4">
          {terminal ? (
            <Button
              variant="outline"
              onClick={() => void reopenTask(activeTask.id, activeTask.version)}
            >
              <RotateCcw size={13} /> 重新打开任务
            </Button>
          ) : null}
          <Button
            variant="danger"
            onClick={() => void archiveTask(activeTask.id, activeTask.version)}
          >
            <Archive size={13} /> 归档任务
          </Button>
        </footer>
      ) : null}

      <TeamTaskDescriptionDrawer
        task={activeTask}
        open={descriptionOpen}
        onClose={() => setDescriptionOpen(false)}
      />
    </section>
  );
}
