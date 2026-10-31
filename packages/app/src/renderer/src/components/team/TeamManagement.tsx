import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Trash2, UserCog } from 'lucide-react';
import type { TeamInvite, TeamTask } from '@memex/shared';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';

interface Props {
  open: boolean;
  onClose(): void;
}

export function TeamManagement({ open, onClose }: Props) {
  const {
    session,
    team,
    members,
    tasks,
    memberEvents,
    createInvite,
    listInvites,
    revokeInvite,
    setMemberRole,
    removeMember,
    closeAssignee,
    updateTask,
  } = useTeamStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [invitesError, setInvitesError] = useState('');
  const [removalTargetId, setRemovalTargetId] = useState<string | null>(null);
  const [replacementByTask, setReplacementByTask] = useState<Record<string, string>>({});
  const identity = [session.userId, session.teamId, session.role, team?.id].join(':');
  const previousIdentity = useRef(identity);

  const refreshInvites = useCallback(async () => {
    setInvitesError('');
    try {
      setInvites(await listInvites());
    } catch (value) {
      setInvitesError(value instanceof Error ? value.message : String(value));
    }
  }, [listInvites]);

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    setEmail('');
    setCode('');
    setError('');
    setActionError('');
    setInvites([]);
    setInvitesError('');
    setRemovalTargetId(null);
    setReplacementByTask({});
    onClose();
  }, [identity, onClose]);

  useEffect(() => {
    if (!open || !team || session.role !== 'leader') return;
    void refreshInvites();
  }, [open, team, session.role, refreshInvites]);

  if (!open || !team || session.role !== 'leader') return null;

  const invite = async () => {
    setError('');
    try {
      setCode(await createInvite({ email: email.trim(), expiresInHours: 72 }));
      await refreshInvites();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setActionError('');
    try {
      await action();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : String(value));
    }
  };

  const revoke = async (inviteId: string) => {
    await runAction(async () => {
      await revokeInvite(inviteId);
      await refreshInvites();
    });
  };

  const activeMembers = members.filter((member) => member.removedAt === null);
  const activeLeaders = activeMembers.filter((member) => member.role === 'leader');
  const removalTarget = activeMembers.find((member) => member.id === removalTargetId) ?? null;
  const removalTasks = removalTarget
    ? tasks.filter((task) => task.archivedAt === null)
    : [];
  const blockingAssignments = removalTarget
    ? removalTasks.flatMap((task) => {
        const assignee = task.assignees.find((item) => item.id === removalTarget.id);
        return assignee && !['approved', 'closed'].includes(assignee.status)
          ? [{ task, assignee }]
          : [];
      })
    : [];
  const blockingLeadership = removalTarget
    ? removalTasks.filter((task) => task.leaders.some((leader) => leader.id === removalTarget.id))
    : [];
  const replacementOptions = removalTarget
    ? activeLeaders.filter((member) => member.id !== removalTarget.id)
    : [];
  const lastLeader = Boolean(removalTarget?.role === 'leader' && activeLeaders.length <= 1);
  const canRemove = Boolean(
    removalTarget
      && !lastLeader
      && blockingAssignments.length === 0
      && blockingLeadership.length === 0,
  );

  const transferLeadership = async (task: TeamTask) => {
    if (!removalTarget) return;
    const replacement = replacementByTask[task.id] ?? replacementOptions[0]?.id;
    if (!replacement) return;
    await runAction(() => updateTask(task.id, {
      expectedVersion: task.version,
      leaderIds: [...new Set([
        ...task.leaders.map((leader) => leader.id).filter((id) => id !== removalTarget.id),
        replacement,
      ])],
    }));
  };

  const confirmRemoval = async () => {
    if (!removalTarget || !canRemove) return;
    await runAction(async () => {
      await removeMember(removalTarget.id);
      setRemovalTargetId(null);
      setReplacementByTask({});
    });
  };

  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.displayName ?? '未知成员';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      role="dialog"
      aria-label="团队管理"
    >
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{team.name} · 团队管理</h2>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="mt-4 rounded-xl border border-[var(--line)] p-3">
          <h3 className="text-[12px] font-semibold">邀请成员</h3>
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="邀请邮箱"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
            <Button disabled={!email.trim()} onClick={() => void invite()}>
              生成邀请码
            </Button>
          </div>
          {code ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] p-2 text-[12px]">
              <code className="min-w-0 flex-1 break-all">{code}</code>
              <button
                aria-label="复制邀请码"
                onClick={() => void navigator.clipboard.writeText(code)}
              >
                <Copy size={14} />
              </button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-[12px] text-red-600">
              {error}
            </p>
          ) : null}
          {actionError ? (
            <p role="alert" className="mt-2 text-[12px] text-red-600">
              {actionError}
            </p>
          ) : null}
        </div>

        <section className="mt-4 rounded-xl border border-[var(--line)] p-3" aria-label="待处理邀请">
          <h3 className="text-[12px] font-semibold">待处理邀请</h3>
          {invitesError ? <p role="alert" className="mt-2 text-[12px] text-red-600">{invitesError}</p> : null}
          <div className="mt-2 space-y-2">
            {invites.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] p-2 text-[12px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{item.email}</p>
                  <p className="text-[10px] text-[var(--faint)]">
                    有效至 {new Date(item.expiresAt).toLocaleString('zh-CN', { hour12: false })}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`撤销邀请-${item.email}`}
                  onClick={() => void revoke(item.id)}
                  className="text-red-600"
                >
                  撤销
                </button>
              </div>
            ))}
            {invites.length === 0 ? <p className="text-[11px] text-[var(--faint)]">暂无待处理邀请</p> : null}
          </div>
        </section>

        <div className="mt-4 space-y-2">
          {activeMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{member.displayName}</p>
                <p className="truncate text-[11px] text-[var(--faint)]">{member.email}</p>
              </div>
              <span className="text-[11px] text-[var(--muted)]">
                {member.role === 'leader' ? '负责人' : '成员'}
              </span>
              <button
                aria-label={`切换角色-${member.displayName}`}
                title="切换角色"
                onClick={() =>
                  void runAction(() =>
                    setMemberRole({
                      userId: member.id,
                      role: member.role === 'leader' ? 'member' : 'leader',
                    }),
                  )
                }
              >
                <UserCog size={14} />
              </button>
              {member.id !== session.userId ? (
                <button
                  aria-label={`移除成员-${member.displayName}`}
                  title="移除成员"
                  onClick={() => {
                    setActionError('');
                    setRemovalTargetId(member.id);
                    setReplacementByTask({});
                  }}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {removalTarget ? (
          <section
            className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-3"
            aria-label={`移除成员-${removalTarget.displayName}`}
          >
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-[12px] font-semibold">移除成员：{removalTarget.displayName}</h3>
              <button type="button" onClick={() => setRemovalTargetId(null)} className="text-[11px] text-[var(--muted)]">
                取消
              </button>
            </div>
            {lastLeader ? <p role="alert" className="mt-2 text-[12px] text-red-600">最后一名负责人不能移除。</p> : null}
            {blockingAssignments.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-[var(--muted)]">先关闭未完成分项：</p>
                {blockingAssignments.map(({ task, assignee }) => (
                  <div key={`${task.id}:${assignee.id}`} className="flex items-center gap-2 rounded-lg bg-[var(--surface)] p-2">
                    <span className="min-w-0 flex-1 truncate text-[12px]">{task.title}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`关闭分项-${task.title}`}
                      onClick={() => void runAction(() => closeAssignee(
                        task.id,
                        assignee.id,
                        '移除成员前关闭分项',
                        assignee.version,
                      ))}
                    >
                      关闭分项
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {blockingLeadership.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-[var(--muted)]">先转移任务领导：</p>
                {blockingLeadership.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface)] p-2">
                    <span className="min-w-0 flex-1 truncate text-[12px]">{task.title}</span>
                    <Select
                      label={`转移领导-${task.title}`}
                      value={replacementByTask[task.id] ?? replacementOptions[0]?.id ?? ''}
                      options={replacementOptions.map((member) => ({ value: member.id, label: member.displayName }))}
                      onChange={(value) => setReplacementByTask((current) => ({ ...current, [task.id]: value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`转移任务领导-${task.title}`}
                      disabled={replacementOptions.length === 0}
                      onClick={() => void transferLeadership(task)}
                    >
                      转移
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Button className="mt-3" disabled={!canRemove} onClick={() => void confirmRemoval()}>
              确认移除成员
            </Button>
          </section>
        ) : null}

        <section className="mt-4" aria-label="成员审计">
          <h3 className="mb-2 text-[12px] font-semibold">成员审计</h3>
          <div className="space-y-1">
            {memberEvents.map((event) => (
              <p key={event.id} className="text-[11px] text-[var(--muted)]">
                {memberName(event.actorId)} {event.type === 'left' ? '退出了团队' : '移除了成员'}（{memberName(event.targetUserId)}） ·{' '}
                {new Date(event.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </p>
            ))}
            {memberEvents.length === 0 ? <p className="text-[11px] text-[var(--faint)]">暂无成员变动记录</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
