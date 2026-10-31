import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamAuthPanel } from '../TeamAuthPanel';

beforeEach(() => {
  useTeamStore.setState(createTeamStore().getState(), true);
  window.memex = {
    ...window.memex,
    team: {
      signIn: vi.fn().mockResolvedValue({
        session: { signedIn: true, userId: 'u1', email: 'u@example.com', displayName: '用户', teamId: null, role: null },
        team: null, members: [], tasks: [], notifications: [],
        sync: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
      }),
      signUp: vi.fn().mockResolvedValue({ needsEmailConfirmation: true }),
      createTeam: vi.fn(),
      joinTeam: vi.fn(),
    } as never,
  };
});

describe('TeamAuthPanel', () => {
  it('signs in with email and password', async () => {
    render(<TeamAuthPanel />);
    await userEvent.type(screen.getByLabelText('团队邮箱'), 'u@example.com');
    await userEvent.type(screen.getByLabelText('团队密码'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '登录团队' }));
    expect(window.memex.team.signIn).toHaveBeenCalledWith({ email: 'u@example.com', password: 'password123' });
  });

  it('shows create-team and join-team choices after login without a team', () => {
    useTeamStore.setState({
      session: { signedIn: true, userId: 'u1', email: 'u@example.com', displayName: '用户', teamId: null, role: null },
    });
    render(<TeamAuthPanel />);
    expect(screen.getByRole('button', { name: '创建团队' })).toBeVisible();
    expect(screen.getByLabelText('邀请码')).toBeVisible();
  });
});
