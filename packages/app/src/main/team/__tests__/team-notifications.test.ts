// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TeamNotification, TeamTask } from '@memex/shared';
import { openTeamCache } from '../team-cache.js';
import { createTeamNotificationController } from '../team-notifications.js';

const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const task: TeamTask = {
  id: '11111111-1111-4111-8111-111111111111',
  teamId,
  title: '即将到期',
  description: null,
  descriptionJson: null,
  priority: 'high',
  dueAt: 1_000,
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
    status: 'doing',
    latestNote: null,
    approvedBy: null,
    approvedAt: null,
    version: 1,
  }],
};

const session = {
  signedIn: true as const,
  userId: 'member-1',
  email: 'm1@example.com',
  displayName: '成员',
  teamId,
  role: 'member' as const,
};

function cachePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'memex-team-notify-')), 'team.db');
}

describe('team notifications', () => {
  it('shows each unread server notification once per device', () => {
    const cache = openTeamCache(cachePath());
    const notification: TeamNotification = {
      id: 'n-1',
      teamId,
      userId: 'member-1',
      type: 'assigned',
      taskId: task.id,
      title: '新任务',
      body: task.title,
      readAt: null,
      createdAt: 1,
    };
    cache.upsertNotification(notification);
    const notify = vi.fn();
    const controller = createTeamNotificationController({ cache, notify, now: () => 10 });

    expect(controller.showUnread(session)).toBe(1);
    expect(controller.showUnread(session)).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    cache.close();
  });

  it('creates one due reminder and one overdue reminder for the same due time', () => {
    const cache = openTeamCache(cachePath());
    const dueAt = 1_000;
    cache.upsertTask({ ...task, dueAt });
    const notify = vi.fn();
    let current = dueAt - 24 * 60 * 60 * 1000;
    const controller = createTeamNotificationController({ cache, notify, now: () => current });

    expect(controller.scanDue(session)).toBe(1);
    expect(controller.scanDue(session)).toBe(0);
    current = dueAt;
    expect(controller.scanDue(session)).toBe(1);
    expect(controller.scanDue(session)).toBe(0);
    expect(notify.mock.calls).toEqual([
      ['任务将在 24 小时内到期', task.title],
      ['任务已逾期', task.title],
    ]);
    expect(cache.listNotifications(session.userId).map((item) => item.type)).toEqual(['overdue', 'due_soon']);
    cache.close();
  });

  it('keeps a read due notification read on later scans', () => {
    const cache = openTeamCache(cachePath());
    cache.upsertTask({ ...task, dueAt: 2_000 });
    const controller = createTeamNotificationController({ cache, notify: vi.fn(), now: () => 1_000 });

    expect(controller.scanDue(session)).toBe(1);
    const [notification] = cache.listNotifications(session.userId);
    expect(notification).toBeDefined();
    cache.upsertNotification({ ...notification!, readAt: 1_001 });

    expect(controller.scanDue(session)).toBe(0);
    expect(cache.listNotifications(session.userId)[0]?.readAt).toBe(1_001);
    cache.close();
  });
  it('does not remind for completed tasks', () => {
    const cache = openTeamCache(cachePath());
    cache.upsertTask({
      ...task,
      assignees: [{ ...task.assignees[0]!, status: 'approved' }],
    });
    const notify = vi.fn();
    const controller = createTeamNotificationController({ cache, notify, now: () => 2_000 });

    expect(controller.scanDue(session)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    cache.close();
  });
});
