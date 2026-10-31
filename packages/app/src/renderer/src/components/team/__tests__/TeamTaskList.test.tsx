import { render, screen, waitFor } from '@testing-library/react';
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
  Element.prototype.scrollIntoView = vi.fn();
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
      updateTask: vi.fn().mockResolvedValue(undefined),
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

  it('creates a multi-assignee task with the creator preselected as leader', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '新建团队任务' }));
    expect(screen.getByLabelText('领导负责人-领导')).toBeChecked();
    await userEvent.type(screen.getByLabelText('团队任务标题'), '新任务');
    await userEvent.click(screen.getByLabelText('执行成员-成员'));
    await userEvent.click(screen.getByLabelText('执行成员-成员二'));
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

  it('opens edit mode from an editable task and updates it', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '编辑团队任务-交付方案' }));

    expect(screen.getByRole('dialog', { name: '编辑团队任务' })).toBeVisible();
    const title = screen.getByLabelText('团队任务标题');
    expect(title).toHaveValue('交付方案');
    await userEvent.clear(title);
    await userEvent.type(title, '修订方案');
    await userEvent.click(screen.getByRole('button', { name: '保存团队任务' }));

    expect(useTeamStore.getState().updateTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ title: '修订方案', expectedVersion: task.version }),
    );
  });

  it('hides creation, management, and edit actions from members', () => {
    useTeamStore.setState({
      session: {
        signedIn: true,
        userId: 'member-1',
        email: 'm1@example.com',
        displayName: '成员',
        teamId: task.teamId,
        role: 'member',
      },
    });
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '新建团队任务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '团队管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑团队任务-交付方案' })).not.toBeInTheDocument();
  });

  it('hides the edit action from leaders who do not own the task', () => {
    useTeamStore.setState({
      session: {
        signedIn: true,
        userId: 'leader-2',
        email: 'leader2@example.com',
        displayName: '领导二',
        teamId: task.teamId,
        role: 'leader',
      },
    });
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '编辑团队任务-交付方案' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建团队任务' })).toBeVisible();
  });

  it('blocks saving when every leader is also an assignee', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '新建团队任务' }));
    await userEvent.type(screen.getByLabelText('团队任务标题'), '审批冲突');
    await userEvent.click(screen.getByLabelText('执行成员-领导'));
    await userEvent.click(screen.getByRole('button', { name: '保存团队任务' }));

    expect(screen.getByRole('alert')).toHaveTextContent('至少需要一名非执行人的审批领导');
    expect(useTeamStore.getState().createTask).not.toHaveBeenCalled();
  });

  it('round-trips the due date through the local datetime input', async () => {
    const dueAt = new Date(2026, 9, 31, 10, 30).getTime();
    const dueTask = { ...task, dueAt };
    useTeamStore.setState({ tasks: [dueTask] });
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '编辑团队任务-交付方案' }));

    expect(screen.getByLabelText('团队任务截止时间')).toHaveValue('2026-10-31T10:30');
    await userEvent.click(screen.getByRole('button', { name: '保存团队任务' }));
    expect(useTeamStore.getState().updateTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ dueAt }),
    );
  });

  it('splits tags on ASCII and Chinese commas', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '新建团队任务' }));
    await userEvent.type(screen.getByLabelText('团队任务标题'), '标签任务');
    await userEvent.click(screen.getByLabelText('执行成员-成员'));
    await userEvent.type(screen.getByLabelText('标签'), '交付，方案,测试');
    await userEvent.click(screen.getByRole('button', { name: '保存团队任务' }));

    expect(useTeamStore.getState().createTask).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['交付', '方案', '测试'] }),
    );
  });

  it('traps tab focus, closes on Escape, and restores the trigger focus', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '新建团队任务' });
    await userEvent.click(trigger);
    const title = screen.getByLabelText('团队任务标题');
    expect(title).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    await userEvent.tab();
    expect(title).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('keeps the editor open while using the priority dropdown', async () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '新建团队任务' }));
    const priority = screen.getByRole('button', { name: '优先级' });

    await userEvent.click(priority);
    expect(screen.getByRole('listbox')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(priority).toHaveTextContent('高');
    expect(screen.getByRole('dialog', { name: '新建团队任务' })).toBeVisible();

    await userEvent.click(priority);
    expect(screen.getByRole('listbox')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '新建团队任务' })).toBeVisible();
    expect(priority).toHaveFocus();
  });

  it('hides the edit action for archived tasks', () => {
    useTeamStore.setState({ tasks: [{ ...task, archivedAt: 1 }] });
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);

    expect(screen.getByText('已归档', { selector: 'span' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '编辑团队任务-交付方案' })).not.toBeInTheDocument();
  });

  it('marks the active task view with aria-pressed', () => {
    render(<TeamTaskList onOpenManagement={vi.fn()} onOpenNotifications={vi.fn()} />);
    expect(screen.getByRole('button', { name: '全部任务' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '我的任务' })).toHaveAttribute('aria-pressed', 'false');
  });
});
