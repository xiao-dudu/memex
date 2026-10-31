import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamBootstrap } from '@memex/shared';
import { createTeamStore, useTeamStore } from '../../../store/useTeamStore';
import { TeamWorkspace } from '../TeamWorkspace';

const bootstrap: TeamBootstrap = {
  session: {
    signedIn: true,
    userId: 'leader-1',
    email: 'leader@example.com',
    displayName: '领导',
    teamId: 't1',
    role: 'leader',
  },
  team: { id: 't1', name: '测试团队' },
  members: [],
  tasks: [],
  notifications: [],
  sync: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  window.memex = {
    ...window.memex,
    team: {
      bootstrap: vi.fn().mockResolvedValue(bootstrap),
      onSyncState: vi.fn(() => () => {}),
    } as never,
  };
});

describe('TeamWorkspace', () => {
  it('shows a loading state during the initial bootstrap', () => {
    const loading = deferred<TeamBootstrap>();
    window.memex.team.bootstrap = vi.fn(() => loading.promise);
    const store = createTeamStore();
    useTeamStore.setState({ ...store.getState(), loading: true }, true);

    render(<TeamWorkspace />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载团队空间…');
    expect(screen.queryByLabelText('团队登录')).not.toBeInTheDocument();
  });

  it('relies on the store for sync-state subscription', async () => {
    const store = createTeamStore();
    useTeamStore.setState({
      ...store.getState(),
      session: bootstrap.session,
      team: bootstrap.team,
      loading: false,
    }, true);

    render(<TeamWorkspace />);

    await waitFor(() => expect(window.memex.team.bootstrap).toHaveBeenCalledOnce());
    expect(window.memex.team.onSyncState).toHaveBeenCalledOnce();
  });
});
