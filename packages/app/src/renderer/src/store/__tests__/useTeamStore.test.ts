import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TeamBootstrap,
  TeamNotification,
  TeamProgressNote,
  TeamSyncState,
  TeamTask,
  TeamTaskEvent,
} from '@memex/shared';
import { createTeamStore } from '../useTeamStore';

const task: TeamTask = {
  id: '11111111-1111-4111-8111-111111111111',
  teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: '团队任务',
  description: null,
  descriptionJson: null,
  priority: 'medium',
  dueAt: null,
  tags: [],
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
      status: 'todo',
      latestNote: null,
      approvedBy: null,
      approvedAt: null,
      version: 1,
    },
  ],
};

const otherTask: TeamTask = {
  ...task,
  id: '22222222-2222-4222-8222-222222222222',
  teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: '另一个团队任务',
};

const note: TeamProgressNote = {
  id: 'note-1',
  taskId: task.id,
  userId: 'leader-1',
  body: '进展',
  createdAt: 2,
};

const event: TeamTaskEvent = {
  id: 'event-1',
  taskId: task.id,
  actorId: 'leader-1',
  type: 'created',
  targetUserId: null,
  fromStatus: null,
  toStatus: null,
  createdAt: 1,
};

const notification: TeamNotification = {
  id: 'notification-1',
  teamId: task.teamId,
  userId: 'leader-1',
  type: 'assigned',
  taskId: task.id,
  title: '新任务',
  body: '你有一个新任务',
  readAt: null,
  createdAt: 1,
};

const idleSync: TeamSyncState = { phase: 'idle', pendingCount: 0, lastSyncedAt: 1, message: null };

const bootstrap: TeamBootstrap = {
  session: {
    signedIn: true,
    userId: 'leader-1',
    email: 'leader@example.com',
    displayName: '领导',
    teamId: task.teamId,
    role: 'leader',
  },
  team: { id: task.teamId, name: '测试团队' },
  members: [],
  tasks: [task],
  notifications: [],
  sync: idleSync,
};

const otherBootstrap: TeamBootstrap = {
  session: {
    signedIn: true,
    userId: 'leader-2',
    email: 'leader2@example.com',
    displayName: '另一个领导',
    teamId: otherTask.teamId,
    role: 'leader',
  },
  team: { id: otherTask.teamId, name: '另一个团队' },
  members: [],
  tasks: [otherTask],
  notifications: [],
  sync: idleSync,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const createTeamApi = () => ({
  bootstrap: vi.fn().mockResolvedValue(bootstrap),
  signIn: vi.fn().mockResolvedValue(bootstrap),
  signOut: vi.fn().mockResolvedValue(undefined),
  listTasks: vi.fn().mockResolvedValue([task]),
  listNotifications: vi.fn().mockResolvedValue([]),
  getTask: vi.fn().mockResolvedValue(task),
  getTaskNotes: vi.fn().mockResolvedValue([note]),
  getTaskEvents: vi.fn().mockResolvedValue([event]),
  createTask: vi.fn().mockResolvedValue(task),
  archiveTask: vi.fn().mockResolvedValue(undefined),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  setMemberRole: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
  sync: vi.fn().mockResolvedValue(idleSync),
  onSyncState: vi.fn((_callback: (state: TeamSyncState) => void) => vi.fn()),
});

let team: ReturnType<typeof createTeamApi>;

beforeEach(() => {
  team = createTeamApi();
  window.memex = {
    ...window.memex,
    team: team as never,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('team store', () => {
  it('bootstraps session and tasks', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    expect(store.getState().team?.name).toBe('测试团队');
    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().session.role).toBe('leader');
  });

  it('creates a task and selects it', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    const created = await store.getState().createTask({
      title: '团队任务',
      assigneeIds: ['member-1'],
      leaderIds: ['leader-1'],
    });
    expect(created.id).toBe(task.id);
    expect(store.getState().activeTask?.id).toBe(task.id);
  });

  it('resets all team state when signing out', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    await store.getState().selectTask(task.id);
    store.setState({
      syncState: { phase: 'offline', pendingCount: 2, lastSyncedAt: 3, message: '离线' },
      loading: true,
      error: '旧错误',
      view: 'overdue',
      memberFilter: 'member-1',
    });

    await store.getState().signOut();

    expect(store.getState()).toMatchObject({
      session: {
        signedIn: false,
        userId: null,
        email: null,
        displayName: null,
        teamId: null,
        role: null,
      },
      team: null,
      members: [],
      tasks: [],
      activeTask: null,
      notes: [],
      events: [],
      notifications: [],
      syncState: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
      loading: false,
      error: null,
      view: 'all',
      memberFilter: null,
    });
  });

  it('clears task history when the session or team changes', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    await store.getState().selectTask(task.id);
    expect(store.getState().notes).toHaveLength(1);
    expect(store.getState().events).toHaveLength(1);

    team.signIn.mockResolvedValueOnce(otherBootstrap);
    await store.getState().signIn({ email: 'leader2@example.com', password: 'secret' });

    expect(store.getState().team?.id).toBe(otherTask.teamId);
    expect(store.getState().activeTask).toBeNull();
    expect(store.getState().notes).toEqual([]);
    expect(store.getState().events).toEqual([]);
  });

  it('clears task history when reload removes the active task', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    await store.getState().selectTask(task.id);

    team.listTasks.mockResolvedValueOnce([]);
    await store.getState().refresh();

    expect(store.getState().activeTask).toBeNull();
    expect(store.getState().notes).toEqual([]);
    expect(store.getState().events).toEqual([]);
  });

  it('clears task history when archiving the active task', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    await store.getState().selectTask(task.id);

    team.listTasks.mockResolvedValueOnce([]);
    await store.getState().archiveTask(task.id, task.version);

    expect(store.getState().activeTask).toBeNull();
    expect(store.getState().notes).toEqual([]);
    expect(store.getState().events).toEqual([]);
  });

  it('stores refresh failures in the error state', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    team.listTasks.mockRejectedValueOnce(new Error('刷新失败'));

    await expect(store.getState().refresh()).rejects.toMatchObject({ message: '刷新失败' });

    expect(store.getState().error).toBe('刷新失败');
  });

  it('stores post-mutation reload failures in the error state', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    team.listTasks.mockRejectedValueOnce(new Error('重新加载失败'));

    await expect(
      store.getState().createTask({
        title: '团队任务',
        assigneeIds: ['member-1'],
        leaderIds: ['leader-1'],
      }),
    ).rejects.toMatchObject({ message: '重新加载失败' });

    expect(store.getState().error).toBe('重新加载失败');
  });

  it('surfaces bootstrap failures after changing a member role', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    team.bootstrap.mockRejectedValueOnce(new Error('刷新成员失败'));

    await expect(
      store.getState().setMemberRole({ userId: 'member-1', role: 'leader' }),
    ).rejects.toMatchObject({ message: '刷新成员失败' });

    expect(store.getState().error).toBe('刷新成员失败');
  });

  it('surfaces bootstrap failures after removing a member', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    team.bootstrap.mockRejectedValueOnce(new Error('刷新成员失败'));

    await expect(store.getState().removeMember('member-1')).rejects.toMatchObject({
      message: '刷新成员失败',
    });

    expect(store.getState().error).toBe('刷新成员失败');
  });

  it('subscribes to sync-state changes once during bootstrap', async () => {
    const unsubscribe = vi.fn();
    let listener: ((state: TeamSyncState) => void) | undefined;
    team.onSyncState.mockImplementation((callback: (state: TeamSyncState) => void) => {
      listener = callback;
      return unsubscribe;
    });
    const store = createTeamStore();

    await store.getState().bootstrap();
    await store.getState().bootstrap();

    expect(team.onSyncState).toHaveBeenCalledTimes(1);
    const syncing: TeamSyncState = { phase: 'syncing', pendingCount: 1, lastSyncedAt: 2, message: null };
    listener?.(syncing);
    expect(store.getState().syncState).toEqual(syncing);
  });

  it('preserves the returned sync state when the follow-up reload fails', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    const synced: TeamSyncState = { phase: 'offline', pendingCount: 2, lastSyncedAt: 3, message: '离线' };
    team.sync.mockResolvedValueOnce(synced);
    team.listTasks.mockRejectedValueOnce(new Error('刷新失败'));

    await store.getState().syncNow();

    expect(store.getState().syncState).toEqual(synced);
    expect(store.getState().error).toBe('刷新失败');
  });

  it('updates a notification locally without reloading tasks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    team.bootstrap.mockResolvedValueOnce({ ...bootstrap, notifications: [notification] });
    const store = createTeamStore();
    await store.getState().bootstrap();

    await store.getState().markNotificationRead(notification.id);

    expect(store.getState().notifications[0]?.readAt).toBe(1_000);
    expect(team.listTasks).not.toHaveBeenCalled();
  });

  it('discards a stale reload result', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    const first = deferred<TeamTask[]>();
    const second = deferred<TeamTask[]>();
    team.listTasks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const firstReload = store.getState().refresh();
    const secondReload = store.getState().refresh();
    second.resolve([otherTask]);
    await secondReload;
    first.resolve([task]);
    await firstReload;

    expect(store.getState().tasks).toEqual([otherTask]);
  });

  it('discards a stale task selection result', async () => {
    const store = createTeamStore();
    await store.getState().bootstrap();
    const first = deferred<TeamTask | null>();
    const second = deferred<TeamTask | null>();
    team.getTask.mockImplementation((id: string) => (id === task.id ? first.promise : second.promise));

    const firstSelection = store.getState().selectTask(task.id);
    const secondSelection = store.getState().selectTask(otherTask.id);
    second.resolve(otherTask);
    await secondSelection;
    first.resolve(task);
    await firstSelection;

    expect(store.getState().activeTask?.id).toBe(otherTask.id);
  });
});
