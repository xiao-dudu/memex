import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamNotification } from '@memex/shared';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamNotificationCenter } from '../TeamNotificationCenter';

const notification: TeamNotification = {
  id: 'notification-1',
  teamId: 't1',
  userId: 'leader-1',
  type: 'assigned',
  taskId: 'task-1',
  title: '新任务',
  body: '你有一个新任务',
  readAt: null,
  createdAt: 1,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  const store = createTeamStore();
  useTeamStore.setState({
    ...store.getState(),
    notifications: [notification],
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    selectTask: vi.fn().mockResolvedValue(undefined),
  }, true);
});

describe('TeamNotificationCenter', () => {
  it('awaits notification actions and closes only after they succeed', async () => {
    const read = deferred<void>();
    const select = deferred<void>();
    const onClose = vi.fn();
    useTeamStore.setState({
      markNotificationRead: vi.fn(() => read.promise),
      selectTask: vi.fn(() => select.promise),
    });
    render(<TeamNotificationCenter open onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /新任务/ }));
    expect(useTeamStore.getState().markNotificationRead).toHaveBeenCalledWith(notification.id);
    expect(useTeamStore.getState().selectTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    read.resolve();
    await waitFor(() => expect(useTeamStore.getState().selectTask).toHaveBeenCalledWith('task-1'));
    expect(onClose).not.toHaveBeenCalled();

    select.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('shows notification failures and stays open', async () => {
    const onClose = vi.fn();
    useTeamStore.setState({
      markNotificationRead: vi.fn().mockRejectedValue(new Error('标记失败')),
    });
    render(<TeamNotificationCenter open onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /新任务/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('标记失败');
    expect(useTeamStore.getState().selectTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
