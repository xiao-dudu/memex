import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTeamStore } from '../../../store/useTeamStore';
import { TeamAuthPanel } from '../TeamAuthPanel';

const noTeamBootstrap = {
  session: {
    signedIn: true,
    userId: 'u1',
    email: 'u@example.com',
    displayName: '用户',
    teamId: null,
    role: null,
  },
  team: null,
  members: [],
  tasks: [],
  notifications: [],
  sync: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
};

beforeEach(() => {
  useTeamStore.setState({
    session: {
      signedIn: false,
      userId: null,
      email: null,
      displayName: null,
      teamId: null,
      role: null,
    },
    team: null,
    members: [],
    tasks: [],
    activeTask: null,
    notes: [],
    events: [],
    notifications: [],
    syncState: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
    loading: false,
    error: null,
    view: 'all',
    memberFilter: null,
  });
  window.memex = {
    ...window.memex,
    team: {
      bootstrap: vi.fn().mockResolvedValue(noTeamBootstrap),
      onSyncState: vi.fn(() => () => {}),
      signIn: vi.fn().mockResolvedValue(noTeamBootstrap),
      signOut: vi.fn().mockResolvedValue(undefined),
      signUp: vi.fn().mockResolvedValue({ needsEmailConfirmation: true }),
      createTeam: vi.fn().mockResolvedValue(noTeamBootstrap),
      joinTeam: vi.fn().mockResolvedValue(noTeamBootstrap),
    } as never,
  };
});

async function openRegistration() {
  render(<TeamAuthPanel />);
  await userEvent.click(screen.getByRole('button', { name: '没有账号？注册' }));
  await userEvent.type(screen.getByLabelText('团队邮箱'), 'u@example.com');
  await userEvent.type(screen.getByLabelText('团队密码'), 'password123');
  await userEvent.type(screen.getByLabelText('显示名称'), '用户');
}

describe('TeamAuthPanel', () => {
  it('signs in with email and password', async () => {
    render(<TeamAuthPanel />);
    await userEvent.type(screen.getByLabelText('团队邮箱'), 'u@example.com');
    await userEvent.type(screen.getByLabelText('团队密码'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '登录团队' }));
    expect(window.memex.team.signIn).toHaveBeenCalledWith({ email: 'u@example.com', password: 'password123' });
  });

  it('bootstraps the new session after signup without email confirmation', async () => {
    vi.mocked(window.memex.team.signUp).mockResolvedValue({ needsEmailConfirmation: false });
    await openRegistration();
    await userEvent.click(screen.getByRole('button', { name: '注册团队' }));

    await waitFor(() => expect(window.memex.team.bootstrap).toHaveBeenCalledOnce());
    await waitFor(() => expect(useTeamStore.getState().session).toEqual(noTeamBootstrap.session));
    expect(await screen.findByRole('button', { name: '创建团队' })).toBeVisible();
  });

  it('announces the email-confirmation registration message', async () => {
    await openRegistration();
    await userEvent.click(screen.getByRole('button', { name: '注册团队' }));

    expect(await screen.findByRole('status')).toHaveTextContent('请先打开邮箱完成确认，再回来登录。');
  });

  it('shows create-team and join-team choices after login without a team', () => {
    useTeamStore.setState({ session: noTeamBootstrap.session });
    render(<TeamAuthPanel />);
    expect(screen.getByRole('button', { name: '创建团队' })).toBeVisible();
    expect(screen.getByLabelText('邀请码')).toBeVisible();
  });

  it('renders nothing when the signed-in user already belongs to a team', () => {
    useTeamStore.setState({
      session: { ...noTeamBootstrap.session, teamId: 'team-1', role: 'member' },
    });
    const { container } = render(<TeamAuthPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers sign-out when signed in without a team', async () => {
    useTeamStore.setState({ session: noTeamBootstrap.session });
    render(<TeamAuthPanel />);

    await userEvent.click(screen.getByRole('button', { name: '退出登录' }));

    expect(window.memex.team.signOut).toHaveBeenCalledOnce();
  });

  it('creates a team with the entered name', async () => {
    useTeamStore.setState({ session: noTeamBootstrap.session });
    render(<TeamAuthPanel />);
    await userEvent.type(screen.getByLabelText('团队名称'), '产品组');
    await userEvent.click(screen.getByRole('button', { name: '创建团队' }));

    await waitFor(() => expect(window.memex.team.createTeam).toHaveBeenCalledWith({ name: '产品组' }));
  });

  it('joins a team with the entered invite code', async () => {
    useTeamStore.setState({ session: noTeamBootstrap.session });
    render(<TeamAuthPanel />);
    await userEvent.type(screen.getByLabelText('邀请码'), 'invite-123');
    await userEvent.click(screen.getByRole('button', { name: '加入团队' }));

    await waitFor(() => expect(window.memex.team.joinTeam).toHaveBeenCalledWith({ token: 'invite-123' }));
  });

  it('renders store errors as alerts', () => {
    useTeamStore.setState({ error: '邮箱或密码错误' });
    render(<TeamAuthPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('邮箱或密码错误');
  });
});
