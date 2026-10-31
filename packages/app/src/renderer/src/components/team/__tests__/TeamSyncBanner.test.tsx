import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamSyncBanner } from '../TeamSyncBanner';

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
    syncState: { phase: 'error', pendingCount: 0, lastSyncedAt: null, message: '同步失败' },
    syncNow: vi.fn().mockResolvedValue(undefined),
  }, true);
});

describe('TeamSyncBanner', () => {
  it('disables retry while a retry is in flight', async () => {
    const retry = deferred<void>();
    useTeamStore.setState({ syncNow: vi.fn(() => retry.promise) });
    render(<TeamSyncBanner />);

    const button = screen.getByRole('button', { name: '重试' });
    await userEvent.click(button);
    expect(useTeamStore.getState().syncNow).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(useTeamStore.getState().syncNow).toHaveBeenCalledOnce();

    retry.resolve();
    await waitFor(() => expect(button).toBeEnabled());
  });
});
