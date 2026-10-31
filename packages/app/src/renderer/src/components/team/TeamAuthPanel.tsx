import { useState, type FormEvent } from 'react';
import { LogIn, Plus, UserPlus } from 'lucide-react';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function TeamAuthPanel() {
  const { session, error, signIn, signUp, signOut, bootstrap, createTeam, joinTeam } = useTeamStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch {
      // The store exposes the error to the panel.
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === 'login') {
        await signIn({ email, password });
      } else {
        const result = await signUp({ email, password, displayName });
        if (result.needsEmailConfirmation) {
          setMessage('请先打开邮箱完成确认，再回来登录。');
        } else {
          await bootstrap();
        }
      }
    });
  };

  if (!session.signedIn) {
    return (
      <section className="flex flex-1 items-center justify-center bg-[var(--surface)] p-8" aria-label="团队登录">
        <form
          onSubmit={submitAuth}
          className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-6 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold">登录团队空间</h2>
            <p className="mt-1 text-[12px] text-[var(--muted)]">个人任务无需登录；团队任务会单独同步。</p>
          </div>
          <label className="block text-[12px]">
            团队邮箱
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              className="mt-1"
            />
          </label>
          <label className="block text-[12px]">
            团队密码
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="mt-1"
            />
          </label>
          {mode === 'register' ? (
            <label className="block text-[12px]">
              显示名称
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1"
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-[12px] text-red-600">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" aria-live="polite" className="text-[12px] text-[var(--muted)]">
              {message}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            <LogIn size={14} /> {mode === 'login' ? '登录团队' : '注册团队'}
          </Button>
          <button
            type="button"
            className="w-full text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </button>
        </form>
      </section>
    );
  }

  if (session.teamId !== null) return null;

  return (
    <section className="flex flex-1 items-center justify-center bg-[var(--surface)] p-8" aria-label="加入团队">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">还没有团队</h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            创建团队后你将成为第一名负责人；也可以输入邀请码加入。
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-[12px]">
            团队名称
            <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="mt-1" />
          </label>
          <Button disabled={busy || !teamName.trim()} onClick={() => void run(() => createTeam({ name: teamName.trim() }))}>
            <Plus size={14} /> 创建团队
          </Button>
        </div>
        <div className="space-y-2 border-t border-[var(--line)] pt-4">
          <label className="block text-[12px]">
            邀请码
            <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="mt-1" />
          </label>
          <Button
            variant="outline"
            disabled={busy || !inviteCode.trim()}
            onClick={() => void run(() => joinTeam({ token: inviteCode.trim() }))}
          >
            <UserPlus size={14} /> 加入团队
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-[12px] text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void run(signOut)}
          className="w-full text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
        >
          退出登录
        </button>
      </div>
    </section>
  );
}
