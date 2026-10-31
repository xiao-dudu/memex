// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TeamMember, TeamProgressNote, TeamTask, TeamTaskEvent } from '@memex/shared';
import { clearTeamCache, openTeamCache } from '../team-cache.js';
import type { TeamChangeSet } from '../team-sync.js';

const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function cachePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'memex-team-cache-')), 'team.db');
}

function task(): TeamTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    teamId,
    title: '缓存任务',
    description: '描述',
    descriptionJson: null,
    priority: 'high',
    dueAt: 2_000,
    tags: ['交付'],
    createdBy: 'leader-1',
    archivedAt: null,
    version: 2,
    createdAt: 1,
    updatedAt: 2,
    leaders: [{ id: 'leader-1', email: 'leader@example.com', displayName: '领导' }],
    assignees: [
      { id: 'member-1', email: 'm1@example.com', displayName: '成员一', status: 'submitted', latestNote: '待验收', approvedBy: null, approvedAt: null, version: 1 },
      { id: 'member-2', email: 'm2@example.com', displayName: '成员二', status: 'doing', latestNote: null, approvedBy: null, approvedAt: null, version: 1 },
    ],
  };
}

function member(): TeamMember {
  return {
    id: 'member-1',
    teamId,
    email: 'm1@example.com',
    displayName: '成员一',
    role: 'member',
    joinedAt: 5,
    removedAt: null,
  };
}

function note(): TeamProgressNote {
  return { id: 'note-1', taskId: task().id, userId: 'member-1', body: '进度', createdAt: 10 };
}

function event(): TeamTaskEvent {
  return {
    id: 'event-1',
    taskId: task().id,
    actorId: 'member-1',
    type: 'started',
    targetUserId: 'member-1',
    fromStatus: 'todo',
    toStatus: 'doing',
    createdAt: 11,
  };
}

function changes(overrides: Partial<TeamChangeSet> = {}): TeamChangeSet {
  return {
    team: { id: teamId, name: '测试团队' },
    members: [member()],
    tasks: [task()],
    notes: [note()],
    events: [event()],
    notifications: [],
    cursor: 6,
    ...overrides,
  };
}

describe('team cache', () => {
  it('hydrates tasks and enforces member visibility', () => {
    const cache = openTeamCache(cachePath());
    cache.upsertTask(task());
    expect(cache.getTask(task().id)?.assignees).toHaveLength(2);
    expect(cache.getTask(task().id)?.leaders).toEqual(task().leaders);
    expect(cache.listTasks({ view: 'all' }, 'member-1', 'member', 1)).toHaveLength(1);
    expect(cache.listTasks({ view: 'all' }, 'member-3', 'member', 1)).toHaveLength(0);
    expect(cache.listTasks({ view: 'pending_review' }, 'leader-1', 'leader', 1)).toHaveLength(1);
    expect(cache.listTasks({ view: 'pending_review' }, 'member-1', 'member', 1)).toHaveLength(0);
    cache.close();
  });

  it('persists notes, notifications and outbox operations', () => {
    const cache = openTeamCache(cachePath());
    cache.appendNote({ id: 'note-1', taskId: task().id, userId: 'member-1', body: '进度', createdAt: 10 });
    cache.upsertNotification({ id: 'n-1', teamId, userId: 'member-1', type: 'assigned', taskId: task().id, title: '新任务', body: '缓存任务', readAt: null, createdAt: 11 });
    cache.enqueue('start_assignee', { taskId: task().id }, 'op-1', 12);
    expect(cache.listNotes(task().id)).toEqual([
      { id: 'note-1', taskId: task().id, userId: 'member-1', body: '进度', createdAt: 10 },
    ]);
    expect(cache.listNotifications('member-1')).toHaveLength(1);
    expect(cache.listPending()).toEqual([expect.objectContaining({ id: 'op-1', type: 'start_assignee', status: 'pending' })]);
    expect(cache.countOutbox()).toBe(1);
    cache.markPending('op-1', 'failed', 'offline');
    expect(cache.listPending()).toEqual([
      expect.objectContaining({ id: 'op-1', status: 'failed', lastError: 'offline' }),
    ]);
    expect(cache.countOutbox()).toBe(1);
    cache.markPending('op-1', 'pending', null);
    expect(cache.listPending()).toEqual([
      expect.objectContaining({ id: 'op-1', status: 'pending', attempts: 2, lastError: null }),
    ]);
    expect(cache.countOutbox()).toBe(1);
    cache.markPending('op-1', 'done', null);
    expect(cache.listPending()).toEqual([]);
    expect(cache.countOutbox()).toBe(0);
    cache.close();
  });

  it('round-trips team metadata and members across reopen', () => {
    const path = cachePath();
    const first = openTeamCache(path);
    first.setMeta('sync_version', '7');
    first.setTeam({ id: teamId, name: '交付团队' });
    first.replaceMembers([member()]);
    first.close();

    const second = openTeamCache(path);
    expect(second.getMeta('sync_version')).toBe('7');
    expect(second.getMeta('missing')).toBeNull();
    expect(second.getTeam()).toEqual({ id: teamId, name: '交付团队' });
    expect(second.listMembers()).toEqual([member()]);
    second.close();
  });

  it('keeps assignment details and appends task events', () => {
    const cache = openTeamCache(cachePath());
    cache.upsertTask(task());
    cache.appendNote({ id: 'note-2', taskId: task().id, userId: 'member-1', body: '最新进度', createdAt: 20 });
    cache.appendEvent({
      id: 'event-1',
      taskId: task().id,
      actorId: 'member-1',
      type: 'submitted',
      targetUserId: 'member-1',
      fromStatus: 'doing',
      toStatus: 'submitted',
      createdAt: 21,
    });

    expect(cache.getTask(task().id)?.assignees[0]).toEqual(expect.objectContaining({
      id: 'member-1',
      email: 'm1@example.com',
      displayName: '成员一',
      status: 'submitted',
      latestNote: '最新进度',
      version: 1,
    }));
    expect(cache.listEvents(task().id)).toEqual([
      {
        id: 'event-1',
        taskId: task().id,
        actorId: 'member-1',
        type: 'submitted',
        targetUserId: 'member-1',
        fromStatus: 'doing',
        toStatus: 'submitted',
        createdAt: 21,
      },
    ]);
    cache.close();
  });

  it('replays note and event IDs idempotently', () => {
    const cache = openTeamCache(cachePath());
    const progress = note();
    const taskEvent = event();

    cache.appendNote(progress);
    cache.appendNote(progress);
    cache.appendEvent(taskEvent);
    cache.appendEvent(taskEvent);

    expect(cache.listNotes(progress.taskId)).toEqual([progress]);
    expect(cache.listEvents(taskEvent.taskId)).toEqual([taskEvent]);
    cache.close();
  });

  it('merges changes and cursor atomically', () => {
    const cache = openTeamCache(cachePath());
    cache.setMeta('cursor', '4');
    cache.mergeChanges(changes({ cursor: 5 }), 5);

    expect(cache.getMeta('cursor')).toBe('5');
    expect(cache.getTeam()).toEqual({ id: teamId, name: '测试团队' });
    expect(cache.listMembers()).toEqual([member()]);
    expect(cache.listNotes(task().id)).toEqual([note()]);
    expect(cache.listEvents(task().id)).toEqual([event()]);

    const invalidTask = { ...task(), id: '33333333-3333-4333-8333-333333333333', title: null as unknown as string };
    expect(() => cache.mergeChanges({
      team: { id: teamId, name: '不应写入' },
      members: [{ ...member(), displayName: '不应写入' }],
      tasks: [invalidTask],
      notes: [{ ...note(), id: 'note-atomic' }],
      events: [{ ...event(), id: 'event-atomic' }],
      notifications: [],
      cursor: 6,
    }, 6)).toThrow();

    expect(cache.getMeta('cursor')).toBe('5');
    expect(cache.getTeam()).toEqual({ id: teamId, name: '测试团队' });
    expect(cache.listMembers()).toEqual([member()]);
    expect(cache.listNotes(task().id)).toEqual([note()]);
    expect(cache.listEvents(task().id)).toEqual([event()]);
    cache.close();
  });

  it('rejects invalid and regressing cursors before writing', () => {
    const cache = openTeamCache(cachePath());
    cache.setMeta('cursor', '5');

    for (const cursor of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => cache.mergeChanges(changes({ cursor: 6 }), cursor)).toThrow('INVALID_CURSOR');
    }
    expect(() => cache.mergeChanges(changes({ cursor: 6 }), 4)).toThrow('CURSOR_REGRESSION');

    expect(cache.getMeta('cursor')).toBe('5');
    expect(cache.getTeam()).toBeNull();
    expect(cache.listMembers()).toEqual([]);
    expect(cache.listNotes(task().id)).toEqual([]);
    expect(cache.listEvents(task().id)).toEqual([]);
    cache.close();
  });

  it('clears the isolated cache database', () => {
    const path = cachePath();
    const cache = openTeamCache(path);
    cache.setMeta('sync_version', '7');
    cache.close();
    expect(existsSync(path)).toBe(true);

    clearTeamCache(path);
    expect(existsSync(path)).toBe(false);

    const reopened = openTeamCache(path);
    expect(reopened.getMeta('sync_version')).toBeNull();
    reopened.close();
    clearTeamCache(path);
  });

  it('preserves notification dedupe metadata when clearing the cache', () => {
    const cache = openTeamCache(cachePath());
    cache.setMeta('sync_version', '7');
    cache.setMeta('shown:local:overdue:task-1:2000:member-1', '1');
    cache.setTeam({ id: teamId, name: '交付团队' });

    cache.clear();

    expect(cache.getMeta('sync_version')).toBeNull();
    expect(cache.getMeta('shown:local:overdue:task-1:2000:member-1')).toBe('1');
    expect(cache.getTeam()).toBeNull();
    cache.close();
  });
});
