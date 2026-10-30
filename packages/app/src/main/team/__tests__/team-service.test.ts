// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openTeamCache } from '../team-cache.js';
import { createTeamService } from '../team-service.js';
import type { TeamRemoteApi } from '../team-sync.js';

const session = { userId: 'leader-1', email: 'leader@example.com', displayName: '领导' };
const leader = { id: 'leader-1', email: 'leader@example.com', displayName: '领导' };
const member = { id: 'member-1', email: 'member@example.com', displayName: '成员' };

function deps() {
  const cache = openTeamCache(join(mkdtempSync(join(tmpdir(), 'memex-team-service-')), 'team.db'));
  cache.replaceMembers([
    { ...leader, teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'leader', joinedAt: 1, removedAt: null },
    { ...member, teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'member', joinedAt: 1, removedAt: null },
  ]);
  const api = {} as TeamRemoteApi;
  const sync = { syncNow: vi.fn().mockResolvedValue({ phase: 'idle', pendingCount: 0, lastSyncedAt: 1, message: null }) };
  const client = {
    getSession: vi.fn().mockResolvedValue(session),
    getSupabase: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { team_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'leader' }, error: null }) }),
          }),
        }),
      }),
    }),
    signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
  };
  const service = createTeamService({ client: client as never, cache, sync, api, now: () => 100, randomId: () => '11111111-1111-4111-8111-111111111111', isOnline: () => true });
  return { cache, api, sync, service };
}

describe('team service', () => {
  it('creates a local task and queues the remote operation', async () => {
    const { cache, service } = deps();
    const task = await service.createTask({
      title: '新任务', assigneeIds: [member.id], leaderIds: [leader.id], tags: ['交付'],
    });
    expect(task.assignees[0]?.status).toBe('todo');
    expect(cache.listPending()[0]?.type).toBe('create_task');
    expect(cache.getTask(task.id)?.title).toBe('新任务');
  });

  it('rejects a task with no approver outside the assignee list', async () => {
    const { service } = deps();
    let error: unknown;
    try {
      await service.createTask({ title: '错误任务', assigneeIds: [leader.id], leaderIds: [leader.id] });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('至少需要一名非执行人的审批领导');
  });
});
