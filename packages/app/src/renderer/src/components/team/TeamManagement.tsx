import { useState } from 'react';
import { Copy, Trash2, UserCog } from 'lucide-react';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Props {
  open: boolean;
  onClose(): void;
}

export function TeamManagement({ open, onClose }: Props) {
  const { team, members, createInvite, setMemberRole, removeMember } = useTeamStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  if (!open || !team) return null;

  const invite = async () => {
    setError('');
    try {
      setCode(await createInvite({ email: email.trim(), expiresInHours: 72 }));
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      role="dialog"
      aria-label="团队管理"
    >
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
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
        <div className="mt-4 space-y-2">
          {members
            .filter((member) => member.removedAt === null)
            .map((member) => (
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
                <button
                  aria-label={`移除成员-${member.displayName}`}
                  title="移除成员"
                  onClick={() => void runAction(() => removeMember(member.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
