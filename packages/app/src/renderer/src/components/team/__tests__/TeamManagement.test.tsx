import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamManagement } from '../TeamManagement';

beforeEach(() => {
  const store = createTeamStore();
  useTeamStore.setState({
    ...store.getState(),
    session: { signedIn: true, userId: 'leader-1', email: 'leader@example.com', displayName: '领导', teamId: 't1', role: 'leader' },
    team: { id: 't1', name: '测试团队' },
    members: [
      { id: 'leader-1', teamId: 't1', email: 'leader@example.com', displayName: '领导', role: 'leader', joinedAt: 1, removedAt: null },
      { id: 'member-1', teamId: 't1', email: 'm1@example.com', displayName: '成员', role: 'member', joinedAt: 1, removedAt: null },
    ],
    createInvite: vi.fn().mockResolvedValue('invite-token-12345678901234567890'),
  }, true);
});

describe('TeamManagement', () => {
  it('creates an invite and shows the code', async () => {
    render(<TeamManagement open onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('邀请邮箱'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: '生成邀请码' }));
    expect(await screen.findByText('invite-token-12345678901234567890')).toBeVisible();
  });
});
