import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamTask } from '@memex/shared';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamTaskDetail } from '../TeamTaskDetail';

const task: TeamTask = {
  id: '11111111-1111-4111-8111-111111111111', teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: '交付方案', description: '需要评审', descriptionJson: null, priority: 'high', dueAt: null, tags: [],
  createdBy: 'leader-1', archivedAt: null, version: 2, createdAt: 1, updatedAt: 2,
  leaders: [{ id: 'leader-1', email: 'leader@example.com', displayName: '领导' }],
  assignees: [
    { id: 'member-1', email: 'm1@example.com', displayName: '成员', status: 'submitted', latestNote: '初稿完成', approvedBy: null, approvedAt: null, version: 2 },
    { id: 'leader-1', email: 'leader@example.com', displayName: '领导', status: 'submitted', latestNote: '领导自交', approvedBy: null, approvedAt: null, version: 2 },
  ],
};

beforeEach(() => {
  const store = createTeamStore();
  useTeamStore.setState({
    ...store.getState(),
    session: { signedIn: true, userId: 'leader-1', email: 'leader@example.com', displayName: '领导', teamId: task.teamId, role: 'leader' },
    team: { id: task.teamId, name: '测试团队' },
    members: [
      { id: 'leader-1', teamId: task.teamId, email: 'leader@example.com', displayName: '领导', role: 'leader', joinedAt: 1, removedAt: null },
      { id: 'member-1', teamId: task.teamId, email: 'm1@example.com', displayName: '成员', role: 'member', joinedAt: 1, removedAt: null },
    ],
    tasks: [task], activeTask: task,
    notes: [{ id: 'n1', taskId: task.id, userId: 'member-1', body: '初稿完成', createdAt: 2 }],
    events: [],
    reviewAssignee: vi.fn().mockResolvedValue(undefined),
  }, true);
});

describe('TeamTaskDetail', () => {
  it('shows notes and approval controls only for other assignees', () => {
    render(<TeamTaskDetail />);
    expect(screen.getByText('初稿完成')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '通过分项' })).toHaveLength(1);
  });

  it('reviews another assignee', async () => {
    render(<TeamTaskDetail />);
    await userEvent.click(screen.getByRole('button', { name: '通过分项' }));
    expect(useTeamStore.getState().reviewAssignee).toHaveBeenCalledWith(task.id, 'member-1', 'approve', null, 2);
  });
});
