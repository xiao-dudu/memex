import { useEffect, useState } from 'react';
import type { TeamTask, TeamTaskInput } from '@memex/shared';
import { hasNonAssigneeApprover } from '@memex/shared/team';
import { fromDateTimeInput, toDateTimeInput } from '../../lib/date';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { TeamMemberPicker } from './TeamMemberPicker';

interface Props {
  open: boolean;
  task?: TeamTask | null;
  onClose(): void;
}

export function TeamTaskEditor({ open, task = null, onClose }: Props) {
  const { members, session, createTask, updateTask } = useTeamStore();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [tags, setTags] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [leaderIds, setLeaderIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setPriority(task?.priority ?? 'medium');
    setTags((task?.tags ?? []).join(', '));
    setDueAt(toDateTimeInput(task?.dueAt ?? null));
    setAssigneeIds(task?.assignees.map((item) => item.id) ?? []);
    setLeaderIds(task?.leaders.map((item) => item.id) ?? []);
    setError('');
  }, [open, task]);

  if (!open) return null;

  const save = async () => {
    setError('');
    const effectiveLeaders = [...new Set([session.userId!, ...leaderIds])];
    if (!hasNonAssigneeApprover(assigneeIds, effectiveLeaders, session.userId!)) {
      setError('至少需要一名非执行人的审批领导');
      return;
    }
    setBusy(true);
    try {
      const input: TeamTaskInput = {
        title: title.trim(),
        priority,
        dueAt: fromDateTimeInput(dueAt),
        tags: tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        assigneeIds,
        leaderIds: effectiveLeaders,
      };
      if (task) await updateTask(task.id, { ...input, expectedVersion: task.version });
      else await createTask(input);
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  const activeMembers = members.filter((item) => item.removedAt === null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={task ? '编辑团队任务' : '新建团队任务'}
    >
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
        <h2 className="text-base font-semibold">{task ? '编辑团队任务' : '新建团队任务'}</h2>
        <label className="block text-[12px]">
          团队任务标题
          <Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1" />
        </label>
        <label className="block text-[12px]">
          优先级
          <Select
            value={priority}
            onChange={(value) => setPriority(value as typeof priority)}
            options={[
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
            ]}
            className="mt-1"
          />
        </label>
        <label className="block text-[12px]">
          截止时间
          <Input
            aria-label="团队任务截止时间"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block text-[12px]">
          标签
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="逗号分隔"
            className="mt-1"
          />
        </label>
        <TeamMemberPicker label="执行成员" value={assigneeIds} options={activeMembers} onChange={setAssigneeIds} />
        <TeamMemberPicker
          label="领导负责人"
          value={leaderIds}
          options={activeMembers.filter((item) => item.role === 'leader')}
          onChange={setLeaderIds}
        />
        {error ? (
          <p role="alert" className="text-[12px] text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy || !title.trim() || assigneeIds.length === 0 || leaderIds.length === 0}
            onClick={() => void save()}
          >
            保存团队任务
          </Button>
        </div>
      </div>
    </div>
  );
}
