import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamTask } from '@memex/shared';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamTaskList } from '../TeamTaskList';

const task: TeamTask = {
  id: '11111111-1111-4111-8111-111111111111',
  teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: '交付方案',
  description: null,
  descriptionJson: null,
  priority: 'high',
  dueAt: null,
  tags: ['交付'],
  createdBy: 'leader-1',
  archivedAt: null,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  leaders: [{ id: 'leader-1', email: 'leader@example.com', displayName: '领导' }],
  assignees: [
    {
      id: 'member-1',
      email: 'm1@example.com',
      displayName: '成员',
      status: 'doing',
      latestNote: null,
      approvedBy: null,
      approvedAt: null,
      version: 1,
    },
  ],
};

beforeEach(() => {
  const store = createTeamStore();
  useTeamStore.setState(
    {
      ...store.getState(),
      session: {
        signedIn: true,
        userId: 'leader-1',
        email: 'leader@example.com',
        displayName: '领导',
        teamId: task.teamId,
        role: 'leader',
      },
      team: { id: task.teamId, name: '测试团队' },
      members: [
        {
          id: 'leader-1',
          teamId: task.teamId,
          email: 'leader@example.com',
          displayName: '领导',
          role: 'leader',
          joinedAt: 1,
          removedAt: null,
        },
        {
          id: 'member-1',
          teamId: task.teamId,
          email: 'm1@example.com',
          displayName: '成员',
          role: 'member',
          joinedAt: 1,
          removedAt: null,
        },
        {
          id: 'member-2',
          teamId: task.teamId,
          email: 'm2@example.com',
          displayName: '成员二',
          role: 'member',
          joinedAt: 1,
          removedAt: null,
        },
        {
          id: 'leader-2',
          teamId: task.teamId,
          email: 'leader2@example.com',
          displayName: '领导二',
          role: 'leader',
          joinedAt: 1,
          removedAt: null,
        },
      ],
      tasks: [task],
      createTask: vi.fn().mockResolvedValue(task),
    },
    true,
  );
});

describe('TeamTaskList', () => {
  it('renders team task state and assignee count', () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    expect(screen.getByText('交付方案')).toBeVisible();
    expect(screen.getByText('1 人执行')).toBeVisible();
    expect(screen.getByText('进行中')).toBeVisible();
  });

  it('creates a multi-assignee task from the editor', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '新建团队任务' }));
    await userEvent.type(screen.getByLabelText('团队任务标题'), '新任务');
    await userEvent.click(screen.getByLabelText('执行成员-成员'));
    await userEvent.click(screen.getByLabelText('执行成员-成员二'));
    await userEvent.click(screen.getByLabelText('领导负责人-领导'));
    await userEvent.click(screen.getByLabelText('领导负责人-领导二'));
    await userEvent.click(screen.getByRole('button', { name: '保存团队任务' }));
    expect(useTeamStore.getState().createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新任务',
        assigneeIds: ['member-1', 'member-2'],
        leaderIds: ['leader-1', 'leader-2'],
      }),
    );
  });
});
