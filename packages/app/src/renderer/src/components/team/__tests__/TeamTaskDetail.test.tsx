import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamMember, TeamTask, TeamTaskEvent } from '@memex/shared';
import { createTeamStore, useTeamStore, type TeamState } from '../../../store/useTeamStore';
import { clearTeamTaskDescriptionDrafts } from '../TeamTaskDescriptionDrawer';
import { TeamTaskDetail } from '../TeamTaskDetail';

vi.mock('../../editor/RichTextEditor', async () => {
  const { createElement } = await import('react');
  const change = (plainText: string) => ({
    plainText,
    contentJson: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: plainText }] }],
    }),
  });
  return {
    RichTextEditor: ({
      contentJson,
      onChange,
      onBlur,
    }: {
      contentJson: string;
      onChange: (value: { plainText: string; contentJson: string }) => void;
      onBlur?: () => void;
    }) =>
      createElement(
        'div',
        { 'data-testid': 'rich-text-editor', 'data-content-json': contentJson },
        createElement(
          'button',
          { type: 'button', 'aria-label': '写入草稿一', onClick: () => onChange(change('草稿一')) },
          '草稿一',
        ),
        createElement(
          'button',
          { type: 'button', 'aria-label': '写入草稿二', onClick: () => onChange(change('草稿二')) },
          '草稿二',
        ),
        createElement(
          'button',
          { type: 'button', 'aria-label': '保存描述草稿', onClick: () => onBlur?.() },
          '保存',
        ),
      ),
  };
});

const leader: TeamMember = {
  id: 'leader-1',
  teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'leader@example.com',
  displayName: '领导',
  role: 'leader',
  joinedAt: 1,
  removedAt: null,
};

const member: TeamMember = {
  id: 'member-1',
  teamId: leader.teamId,
  email: 'm1@example.com',
  displayName: '成员',
  role: 'member',
  joinedAt: 1,
  removedAt: null,
};

const task: TeamTask = {
  id: '11111111-1111-4111-8111-111111111111',
  teamId: leader.teamId,
  title: '交付方案',
  description: '需要评审',
  descriptionJson: null,
  priority: 'high',
  dueAt: null,
  tags: [],
  createdBy: leader.id,
  archivedAt: null,
  version: 2,
  createdAt: 1,
  updatedAt: 2,
  leaders: [{ id: leader.id, email: leader.email, displayName: leader.displayName }],
  assignees: [
    {
      id: member.id,
      email: member.email,
      displayName: member.displayName,
      status: 'submitted',
      latestNote: '初稿完成',
      approvedBy: null,
      approvedAt: null,
      version: 2,
    },
    {
      id: leader.id,
      email: leader.email,
      displayName: leader.displayName,
      status: 'submitted',
      latestNote: '领导自交',
      approvedBy: null,
      approvedAt: null,
      version: 2,
    },
  ],
};

const task2: TeamTask = {
  ...task,
  id: '22222222-2222-4222-8222-222222222222',
  title: '第二任务',
  description: '第二描述',
};

const event = (overrides: Partial<TeamTaskEvent>): TeamTaskEvent => ({
  id: 'e1',
  taskId: task.id,
  actorId: leader.id,
  type: 'created',
  targetUserId: null,
  fromStatus: null,
  toStatus: null,
  createdAt: 2,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function resetStore(overrides: Partial<TeamState> = {}) {
  const store = createTeamStore();
  useTeamStore.setState(
    {
      ...store.getState(),
      session: {
        signedIn: true,
        userId: leader.id,
        email: leader.email,
        displayName: leader.displayName,
        teamId: task.teamId,
        role: 'leader',
      },
      team: { id: task.teamId, name: '测试团队' },
      members: [leader, member],
      tasks: [task],
      activeTask: task,
      notes: [{ id: 'n1', taskId: task.id, userId: member.id, body: '初稿完成', createdAt: 2 }],
      events: [],
      updateTask: vi.fn().mockResolvedValue(undefined),
      reviewAssignee: vi.fn().mockResolvedValue(undefined),
      startAssignee: vi.fn().mockResolvedValue(undefined),
      submitAssignee: vi.fn().mockResolvedValue(undefined),
      addProgressNote: vi.fn().mockResolvedValue(undefined),
      closeAssignee: vi.fn().mockResolvedValue(undefined),
      reopenTask: vi.fn().mockResolvedValue(undefined),
      archiveTask: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
    true,
  );
}

beforeEach(() => {
  clearTeamTaskDescriptionDrafts();
  resetStore();
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
    expect(useTeamStore.getState().reviewAssignee).toHaveBeenCalledWith(
      task.id,
      member.id,
      'approve',
      null,
      2,
    );
  });

  it('serializes autosaves and uses the refreshed task version for a queued draft', async () => {
    const first = deferred<void>();
    const updateTask = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    resetStore({ updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));

    expect(updateTask).toHaveBeenNthCalledWith(
      1,
      task.id,
      expect.objectContaining({ description: '草稿一', expectedVersion: 2 }),
    );

    await userEvent.click(screen.getByRole('button', { name: '写入草稿二' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    expect(updateTask).toHaveBeenCalledTimes(1);

    act(() => {
      useTeamStore.setState({ activeTask: { ...task, version: 3 } });
    });
    await act(async () => {
      first.resolve();
      await first.promise;
    });

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenNthCalledWith(
      2,
      task.id,
      expect.objectContaining({ description: '草稿二', expectedVersion: 3 }),
    );
  });

  it('preserves a failed draft and retries it with the refreshed task version', async () => {
    const updateTask = vi
      .fn()
      .mockRejectedValueOnce(new Error('VERSION_CONFLICT'))
      .mockResolvedValueOnce(undefined);
    resetStore({ updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试'),
    );

    act(() => {
      useTeamStore.setState({ activeTask: { ...task, version: 3 } });
    });
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenNthCalledWith(
      2,
      task.id,
      expect.objectContaining({ description: '草稿一', expectedVersion: 3 }),
    );
  });

  it('flushes a pending draft on close with the current task version', async () => {
    const updateTask = vi.fn().mockResolvedValue(undefined);
    resetStore({ updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    act(() => {
      useTeamStore.setState({ activeTask: { ...task, version: 3 } });
    });
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({ description: '草稿一', expectedVersion: 3 }),
      ),
    );
  });

  it('recovers a draft when a close-time save fails after the drawer closes', async () => {
    const firstSave = deferred<void>();
    const updateTask = vi.fn().mockReturnValueOnce(firstSave.promise);
    resetStore({ updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    expect(updateTask).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await act(async () => {
      firstSave.reject(new Error('VERSION_CONFLICT'));
      try {
        await firstSave.promise;
      } catch {
        // The drawer handles the failed write and persists the draft.
      }
    });
    expect(updateTask).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试');
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-content-json')).toContain(
      '草稿一',
    );
  });

  it('isolates pending drafts when switching tasks', async () => {
    const updateTask = vi.fn().mockRejectedValue(new Error('VERSION_CONFLICT'));
    resetStore({ tasks: [task, task2], updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试'),
    );
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    act(() => {
      useTeamStore.setState({ activeTask: task2 });
    });
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-content-json')).toContain(
      '第二描述',
    );

    await userEvent.click(screen.getByRole('button', { name: '写入草稿二' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试'),
    );
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    act(() => {
      useTeamStore.setState({ activeTask: task });
    });
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试');
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-content-json')).toContain(
      '草稿一',
    );
  });

  it('clears only the retried task draft after a successful retry', async () => {
    const updateTask = vi
      .fn()
      .mockRejectedValueOnce(new Error('VERSION_CONFLICT'))
      .mockRejectedValueOnce(new Error('VERSION_CONFLICT'))
      .mockResolvedValueOnce(undefined);
    resetStore({ tasks: [task, task2], updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试'),
    );
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    act(() => {
      useTeamStore.setState({ activeTask: task2 });
    });
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿二' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试'),
    );
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    act(() => {
      useTeamStore.setState({ activeTask: task });
    });
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(3));
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-content-json')).toContain(
      '需要评审',
    );
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    act(() => {
      useTeamStore.setState({ activeTask: task2 });
    });
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试');
    expect(screen.getByTestId('rich-text-editor').getAttribute('data-content-json')).toContain(
      '草稿二',
    );
  });

  it('drains task B after an in-flight task A save fails', async () => {
    const firstSave = deferred<void>();
    const updateTask = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce(undefined);
    resetStore({ tasks: [task, task2], updateTask });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿一' }));
    await userEvent.click(screen.getByRole('button', { name: '保存描述草稿' }));
    expect(updateTask).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    act(() => {
      useTeamStore.setState({ activeTask: task2 });
    });
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    await userEvent.click(screen.getByRole('button', { name: '写入草稿二' }));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 550));
    });
    expect(updateTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.reject(new Error('VERSION_CONFLICT'));
      try {
        await firstSave.promise;
      } catch {
        // The queue handles the failed task A write.
      }
    });

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenNthCalledWith(
      2,
      task2.id,
      expect.objectContaining({ description: '草稿二' }),
    );
  });

  it('renders archived tasks as read-only', async () => {
    const archivedTask: TeamTask = {
      ...task,
      archivedAt: 3,
      assignees: [
        { ...task.assignees[0]!, status: 'submitted' },
        { ...task.assignees[1]!, status: 'todo' },
      ],
    };
    resetStore({ tasks: [archivedTask], activeTask: archivedTask });
    render(<TeamTaskDetail />);

    expect(screen.queryByRole('button', { name: '通过分项' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退回分项' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始处理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '提交团队验收' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档任务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新打开任务' })).not.toBeInTheDocument();
    expect(screen.queryByText('查看/编辑描述')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));
    expect(screen.getByRole('dialog', { name: '团队任务描述' })).toBeVisible();
    expect(screen.queryByTestId('rich-text-editor')).not.toBeInTheDocument();

    act(() => {
      useTeamStore.setState({
        activeTask: {
          ...archivedTask,
          assignees: archivedTask.assignees.map((item) =>
            item.id === leader.id ? { ...item, status: 'doing' } : item,
          ),
        },
      });
    });
    expect(screen.queryByRole('button', { name: '提交团队验收' })).not.toBeInTheDocument();
  });

  it('gives ordinary assignees a read-only description view', async () => {
    resetStore({
      session: {
        signedIn: true,
        userId: member.id,
        email: member.email,
        displayName: member.displayName,
        teamId: task.teamId,
        role: 'member',
      },
    });
    render(<TeamTaskDetail />);

    expect(screen.queryByText('查看/编辑描述')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '打开团队任务描述' }));

    expect(screen.getByRole('dialog', { name: '团队任务描述' })).toBeVisible();
    expect(screen.getByLabelText('团队任务描述内容')).toHaveTextContent('需要评审');
    expect(screen.queryByTestId('rich-text-editor')).not.toBeInTheDocument();
  });

  it('shows reopen only for terminal non-archived tasks', () => {
    const terminalTask: TeamTask = {
      ...task,
      assignees: task.assignees.map((item) => ({ ...item, status: 'approved' })),
    };
    resetStore({ tasks: [terminalTask], activeTask: terminalTask });
    const first = render(<TeamTaskDetail />);
    expect(screen.getByRole('button', { name: '重新打开任务' })).toBeVisible();

    first.unmount();
    resetStore();
    render(<TeamTaskDetail />);
    expect(screen.queryByRole('button', { name: '重新打开任务' })).not.toBeInTheDocument();
  });

  it('lets assignees add repeated progress notes', async () => {
    const doingTask: TeamTask = {
      ...task,
      assignees: task.assignees.map((item) =>
        item.id === member.id ? { ...item, status: 'doing', version: 3 } : item,
      ),
    };
    const addProgressNote = vi.fn().mockResolvedValue(undefined);
    resetStore({
      session: {
        signedIn: true,
        userId: member.id,
        email: member.email,
        displayName: member.displayName,
        teamId: task.teamId,
        role: 'member',
      },
      activeTask: doingTask,
      tasks: [doingTask],
      addProgressNote,
    });
    render(<TeamTaskDetail />);

    await userEvent.type(screen.getByLabelText('补充进展备注'), '补充交付物');
    await userEvent.click(screen.getByRole('button', { name: '添加进展备注' }));

    expect(addProgressNote).toHaveBeenCalledWith(doingTask.id, '补充交付物');
  });

  it('lets leaders close an unfinished assignment with a reason', async () => {
    const closeAssignee = vi.fn().mockResolvedValue(undefined);
    resetStore({ closeAssignee });
    render(<TeamTaskDetail />);

    await userEvent.click(screen.getByRole('button', { name: '关闭分项-成员' }));
    await userEvent.type(screen.getByLabelText('关闭原因-成员'), '成员已离开项目');
    await userEvent.click(screen.getByRole('button', { name: '确认关闭分项-成员' }));

    expect(closeAssignee).toHaveBeenCalledWith(task.id, member.id, '成员已离开项目', 2);
  });

  it('surfaces task-detail action failures', async () => {
    const doingTask: TeamTask = {
      ...task,
      assignees: task.assignees.map((item) =>
        item.id === member.id ? { ...item, status: 'doing', version: 3 } : item,
      ),
    };
    resetStore({
      session: {
        signedIn: true,
        userId: member.id,
        email: member.email,
        displayName: member.displayName,
        teamId: task.teamId,
        role: 'member',
      },
      activeTask: doingTask,
      tasks: [doingTask],
      submitAssignee: vi.fn().mockRejectedValue(new Error('提交失败')),
    });
    render(<TeamTaskDetail />);

    await userEvent.type(screen.getByLabelText('本次进度备注'), '交付说明');
    await userEvent.click(screen.getByRole('button', { name: '提交团队验收' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('提交失败');
  });

  it('shows note authors and human-readable audit events with actor and target names', () => {
    resetStore({
      events: [
        event({ id: 'e1', type: 'approved', targetUserId: member.id }),
        event({ id: 'e2', type: 'created' }),
      ],
    });
    render(<TeamTaskDetail />);

    const notes = screen.getByRole('region', { name: '进度备注历史' });
    expect(within(notes).getByText('成员')).toBeVisible();

    const audit = screen.getByRole('region', { name: '审计记录' });
    expect(within(audit).getByText(/领导 通过了分项（成员）/)).toBeVisible();
    expect(within(audit).getByText(/领导 创建了任务/)).toBeVisible();
  });
});
