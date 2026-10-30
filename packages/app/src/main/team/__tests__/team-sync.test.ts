// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TeamMember, TeamNotification, TeamProgressNote, TeamTask, TeamTaskEvent } from '@memex/shared';
import { openTeamCache } from '../team-cache.js';
import { createTeamSync, type TeamRemoteApi } from '../team-sync.js';

const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const task: TeamTask = {
  id: '11111111-1111-4111-8111-111111111111',
  teamId,
  title: '同步任务',
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
  assignees: [{
    id: 'member-1',
    email: 'm1@example.com',
    displayName: '成员',
    status: 'todo',
    latestNote: null,
    approvedBy: null,
    approvedAt: null,
    version: 1,
  }],
};

function cachePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'memex-team-sync-')), 'team.db');
}

function fakeApi(overrides: Partial<TeamRemoteApi> = {}): TeamRemoteApi {
  return {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    startAssignee: vi.fn(),
    addProgressNote: vi.fn(),
    submitAssignee: vi.fn(),
    reviewAssignee: vi.fn(),
    reopenTask: vi.fn(),
    archiveTask: vi.fn(),
    closeAssignee: vi.fn(),
    markNotificationRead: vi.fn(),
    createTeam: vi.fn(),
    createInvite: vi.fn(),
    acceptInvite: vi.fn(),
    revokeInvite: vi.fn(),
    setMemberRole: vi.fn(),
    removeMember: vi.fn(),
    pullChanges: vi.fn().mockResolvedValue({
      team: { id: teamId, name: '测试团队' },
      members: [],
      tasks: [task],
      notes: [],
      events: [],
      notifications: [],
      cursor: 9,
    }),
    ...overrides,
  };
}

describe('team sync', () => {
  it('flushes outbox before pulling changes', async () => {
    const cache = openTeamCache(cachePath());
    cache.upsertTask(task);
    cache.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
    const api = fakeApi();
    const now = vi.fn(() => 100);
    const mergeChanges = vi.spyOn(cache, 'mergeChanges');
    const sync = createTeamSync({ api, cache, isOnline: () => true, now });

    const state = await sync.syncNow(teamId);

    expect(api.startAssignee).toHaveBeenCalledWith('op-1', task.id, 1);
    expect(api.pullChanges).toHaveBeenCalledWith(teamId, 0);
    expect((api.startAssignee as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((api.pullChanges as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
    expect(mergeChanges).toHaveBeenCalledWith(expect.objectContaining({ cursor: 9 }), 9);
    expect(cache.listPending()).toHaveLength(0);
    expect(cache.getMeta('cursor')).toBe('9');
    expect(cache.getMeta('lastSyncedAt')).toBe('100');
    expect(now).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ phase: 'idle', pendingCount: 0, lastSyncedAt: 100, message: null });
    cache.close();
  });

  it('keeps queued work when offline', async () => {
    const cache = openTeamCache(cachePath());
    cache.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
    const api = fakeApi();
    const sync = createTeamSync({ api, cache, isOnline: () => false, now: () => 100 });

    const state = await sync.syncNow(teamId);

    expect(state).toEqual({ phase: 'offline', pendingCount: 1, lastSyncedAt: null, message: '等待联网' });
    expect(cache.listPending()).toHaveLength(1);
    expect(api.pullChanges).not.toHaveBeenCalled();
    cache.close();
  });

  it('continues after a failed row and still pulls changes', async () => {
    const cache = openTeamCache(cachePath());
    cache.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
    cache.enqueue('add_progress_note', { taskId: task.id, noteId: 'note-1', body: '继续同步' }, 'op-2', 2);
    const api = fakeApi({ startAssignee: vi.fn().mockRejectedValue(new Error('VERSION_CONFLICT')) });
    const sync = createTeamSync({ api, cache, isOnline: () => true, now: () => 100 });

    const state = await sync.syncNow(teamId);

    expect(api.startAssignee).toHaveBeenCalled();
    expect(api.addProgressNote).toHaveBeenCalledWith('op-2', task.id, 'note-1', '继续同步');
    expect(api.pullChanges).toHaveBeenCalledWith(teamId, 0);
    expect(cache.getMeta('cursor')).toBe('9');
    expect(state).toEqual({ phase: 'error', pendingCount: 1, lastSyncedAt: 100, message: 'VERSION_CONFLICT' });
    expect(cache.listPending()).toEqual([
      expect.objectContaining({ id: 'op-1', status: 'failed', lastError: 'VERSION_CONFLICT' }),
    ]);
    cache.close();
  });

  it('passes client-generated note ids through outbox dispatch', async () => {
    const cache = openTeamCache(cachePath());
    cache.enqueue('add_progress_note', { taskId: task.id, noteId: 'note-a', body: '进展' }, 'op-1', 1);
    cache.enqueue('submit_assignee', { taskId: task.id, noteId: 'note-b', body: '请验收', expectedVersion: 1 }, 'op-2', 2);
    const api = fakeApi({
      pullChanges: vi.fn().mockResolvedValue({
        team: { id: teamId, name: '测试团队' },
        members: [],
        tasks: [task],
        notes: [{ id: 'note-a', taskId: task.id, userId: 'member-1', body: '进展', createdAt: 2 }],
        events: [],
        notifications: [],
        cursor: 9,
      }),
    });
    const sync = createTeamSync({ api, cache, isOnline: () => true, now: () => 100 });

    await sync.syncNow(teamId);

    expect(api.addProgressNote).toHaveBeenCalledWith('op-1', task.id, 'note-a', '进展');
    expect(api.submitAssignee).toHaveBeenCalledWith('op-2', task.id, 'note-b', '请验收', 1);
    expect(cache.listNotes(task.id)).toEqual([
      { id: 'note-a', taskId: task.id, userId: 'member-1', body: '进展', createdAt: 2 },
    ]);
    cache.close();
  });

  it('retries failed operations on the next sync', async () => {
    const cache = openTeamCache(cachePath());
    cache.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
    const startAssignee = vi.fn()
      .mockRejectedValueOnce(new Error('TRANSIENT'))
      .mockResolvedValueOnce(undefined);
    const api = fakeApi({ startAssignee });
    const sync = createTeamSync({ api, cache, isOnline: () => true, now: () => 100 });

    const first = await sync.syncNow(teamId);

    expect(first).toEqual({ phase: 'error', pendingCount: 1, lastSyncedAt: 100, message: 'TRANSIENT' });
    expect(cache.listPending()).toEqual([
      expect.objectContaining({ id: 'op-1', status: 'failed', lastError: 'TRANSIENT' }),
    ]);

    const second = await sync.syncNow(teamId);

    expect(startAssignee).toHaveBeenCalledTimes(2);
    expect(cache.listPending()).toEqual([]);
    expect(cache.getMeta('cursor')).toBe('9');
    expect(second).toEqual({ phase: 'idle', pendingCount: 0, lastSyncedAt: 100, message: null });
    cache.close();
  });

  it('rejects cursor regression without merging changes', async () => {
    const cache = openTeamCache(cachePath());
    cache.setMeta('cursor', '10');
    const api = fakeApi();
    const sync = createTeamSync({ api, cache, isOnline: () => true, now: () => 100 });

    const state = await sync.syncNow(teamId);

    expect(state.phase).toBe('error');
    expect(state.message).toContain('CURSOR_REGRESSION');
    expect(api.pullChanges).toHaveBeenCalledWith(teamId, 10);
    expect(cache.getMeta('cursor')).toBe('10');
    expect(cache.getTeam()).toBeNull();
    expect(cache.getTask(task.id)).toBeNull();
    cache.close();
  });

  it('merges the full change set into the cache', async () => {
    const member: TeamMember = {
      id: 'member-1',
      teamId,
      email: 'm1@example.com',
      displayName: '成员',
      role: 'member',
      joinedAt: 1,
      removedAt: null,
    };
    const note: TeamProgressNote = {
      id: 'note-1',
      taskId: task.id,
      userId: member.id,
      body: '同步进度',
      createdAt: 2,
    };
    const event: TeamTaskEvent = {
      id: 'event-1',
      taskId: task.id,
      actorId: member.id,
      type: 'started',
      targetUserId: member.id,
      fromStatus: 'todo',
      toStatus: 'doing',
      createdAt: 3,
    };
    const notification: TeamNotification = {
      id: 'notification-1',
      teamId,
      userId: member.id,
      type: 'assigned',
      taskId: task.id,
      title: '新任务',
      body: '同步任务',
      readAt: null,
      createdAt: 4,
    };
    const cache = openTeamCache(cachePath());
    const api = fakeApi({
      pullChanges: vi.fn().mockResolvedValue({
        team: { id: teamId, name: '测试团队' },
        members: [member],
        tasks: [task],
        notes: [note],
        events: [event],
        notifications: [notification],
        cursor: 12,
      }),
    });
    const sync = createTeamSync({ api, cache, isOnline: () => true, now: () => 200 });

    const state = await sync.syncNow(teamId);

    expect(cache.getTeam()).toEqual({ id: teamId, name: '测试团队' });
    expect(cache.listMembers()).toEqual([member]);
    expect(cache.getTask(task.id)).toEqual({
      ...task,
      assignees: [{ ...task.assignees[0]!, latestNote: note.body }],
    });
    expect(cache.listNotes(task.id)).toEqual([note]);
    expect(cache.listEvents(task.id)).toEqual([event]);
    expect(cache.listNotifications(member.id)).toEqual([notification]);
    expect(cache.getMeta('cursor')).toBe('12');
    expect(cache.getMeta('lastSyncedAt')).toBe('200');
    expect(state).toEqual({ phase: 'idle', pendingCount: 0, lastSyncedAt: 200, message: null });
    cache.close();
  });
});
