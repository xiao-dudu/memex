import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamBootstrap, TeamTask } from '@memex/shared';
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
  sync: { phase: 'idle', pendingCount: 0, lastSyncedAt: 1, message: null },
};

beforeEach(() => {
  window.memex = {
    ...window.memex,
    team: {
      bootstrap: vi.fn().mockResolvedValue(bootstrap),
      listTasks: vi.fn().mockResolvedValue([task]),
      listNotifications: vi.fn().mockResolvedValue([]),
      getTask: vi.fn().mockResolvedValue(task),
      getTaskNotes: vi.fn().mockResolvedValue([]),
      getTaskEvents: vi.fn().mockResolvedValue([]),
      createTask: vi.fn().mockResolvedValue(task),
      sync: vi.fn().mockResolvedValue(bootstrap.sync),
    } as never,
  };
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
});
