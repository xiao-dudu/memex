import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamTask } from '@memex/shared';
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
    listInvites: vi.fn().mockResolvedValue([]),
    revokeInvite: vi.fn().mockResolvedValue(undefined),
    closeAssignee: vi.fn().mockResolvedValue(undefined),
    updateTask: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    tasks: [],
    memberEvents: [],
  }, true);
});

describe('TeamManagement', () => {
  it('creates an invite and shows the code', async () => {
    render(<TeamManagement open onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('邀请邮箱'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: '生成邀请码' }));
    expect(await screen.findByText('invite-token-12345678901234567890')).toBeVisible();
  });

  it('lists active invites and revokes them', async () => {
    const revokeInvite = vi.fn().mockResolvedValue(undefined);
    useTeamStore.setState({
      listInvites: vi.fn().mockResolvedValue([{
        id: 'invite-1',
        teamId: 't1',
        email: 'pending@example.com',
        expiresAt: Date.now() + 3_600_000,
        acceptedAt: null,
        revokedAt: null,
        createdAt: Date.now(),
      }]),
      revokeInvite,
    });
    render(<TeamManagement open onClose={vi.fn()} />);

    expect(await screen.findByText('pending@example.com')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '撤销邀请-pending@example.com' }));
    expect(revokeInvite).toHaveBeenCalledWith('invite-1');
  });

  it('guides removal by closing unfinished assignments before confirmation', async () => {
    const closeAssignee = vi.fn().mockResolvedValue(undefined);
    const task: TeamTask = {
      id: 'task-1',
      teamId: 't1',
      title: '阻塞任务',
      description: null,
      descriptionJson: null,
      priority: 'medium',
      dueAt: null,
      tags: [],
      createdBy: 'leader-1',
      archivedAt: null,
      version: 2,
      createdAt: 1,
      updatedAt: 1,
      leaders: [{ id: 'leader-1', email: 'leader@example.com', displayName: '领导' }],
      assignees: [{
        id: 'member-1',
        email: 'm1@example.com',
        displayName: '成员',
        status: 'doing',
        latestNote: null,
        approvedBy: null,
        approvedAt: null,
        version: 3,
      }],
    };
    useTeamStore.setState({ tasks: [task], closeAssignee });
    render(<TeamManagement open onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '移除成员-成员' }));
    expect(screen.getByRole('region', { name: '移除成员-成员' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '关闭分项-阻塞任务' }));

    expect(closeAssignee).toHaveBeenCalledWith(task.id, 'member-1', '移除成员前关闭分项', 3);
  });

  it('guides task leadership transfer before removal', async () => {
    const updateTask = vi.fn().mockResolvedValue(undefined);
    const task: TeamTask = {
      id: 'task-2',
      teamId: 't1',
      title: '领导任务',
      description: null,
      descriptionJson: null,
      priority: 'medium',
      dueAt: null,
      tags: [],
      createdBy: 'member-1',
      archivedAt: null,
      version: 4,
      createdAt: 1,
      updatedAt: 1,
      leaders: [
        { id: 'member-1', email: 'm1@example.com', displayName: '成员' },
        { id: 'leader-1', email: 'leader@example.com', displayName: '领导' },
      ],
      assignees: [{
        id: 'leader-1',
        email: 'leader@example.com',
        displayName: '领导',
        status: 'doing',
        latestNote: null,
        approvedBy: null,
        approvedAt: null,
        version: 1,
      }],
    };
    useTeamStore.setState({
      tasks: [task],
      members: [
        ...useTeamStore.getState().members,
        { id: 'leader-2', teamId: 't1', email: 'leader2@example.com', displayName: '另一领导', role: 'leader', joinedAt: 1, removedAt: null },
      ],
      updateTask,
    });
    render(<TeamManagement open onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '移除成员-成员' }));
    await userEvent.click(screen.getByRole('button', { name: '转移任务领导-领导任务' }));

    expect(updateTask).toHaveBeenCalledWith(task.id, {
      expectedVersion: 4,
      leaderIds: ['leader-1'],
    });
  });

  it('shows member removal audit events with actor, target, and time', () => {
    useTeamStore.setState({
      memberEvents: [{
        id: 'event-1',
        teamId: 't1',
        actorId: 'leader-1',
        targetUserId: 'member-1',
        type: 'removed',
        createdAt: 1_700_000_000_000,
      }],
    });
    render(<TeamManagement open onClose={vi.fn()} />);

    const audit = screen.getByRole('region', { name: '成员审计' });
    expect(audit).toHaveTextContent('领导');
    expect(audit).toHaveTextContent('成员');
    expect(audit).toHaveTextContent(new Date(1_700_000_000_000).toLocaleString('zh-CN', { hour12: false }));
  });

  it('does not open management for members', () => {
    useTeamStore.setState((state) => ({
      session: { ...state.session, role: 'member' },
    }));
    render(<TeamManagement open onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: '团队管理' })).not.toBeInTheDocument();
  });

  it('resets invite state and requests close when the signed-in identity changes', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<TeamManagement open onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('邀请邮箱'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: '生成邀请码' }));
    expect(await screen.findByText('invite-token-12345678901234567890')).toBeVisible();

    act(() => {
      useTeamStore.setState((state) => ({
        session: {
          ...state.session,
          userId: 'leader-2',
          email: 'leader2@example.com',
          displayName: '另一名领导',
        },
      }));
    });
    rerender(<TeamManagement open onClose={onClose} />);

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('邀请邮箱')).toHaveValue('');
    expect(screen.queryByText('invite-token-12345678901234567890')).not.toBeInTheDocument();
  });
});
