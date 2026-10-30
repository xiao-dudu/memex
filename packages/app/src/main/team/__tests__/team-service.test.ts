// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TeamMember, TeamTask } from '@memex/shared';
import { openTeamCache } from '../team-cache.js';
import { createTeamService } from '../team-service.js';
import type { TeamRemoteApi } from '../team-sync.js';

const teamA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teamB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session = { userId: 'leader-1', email: 'leader@example.com', displayName: '领导' };
const memberSession = { userId: 'member-1', email: 'member@example.com', displayName: '成员' };
const leader = { id: 'leader-1', email: 'leader@example.com', displayName: '领导' };
const secondLeader = { id: 'leader-2', email: 'leader2@example.com', displayName: '副领导' };
const member = { id: 'member-1', email: 'member@example.com', displayName: '成员' };

function memberRow(user: typeof leader, teamId: string, role: 'leader' | 'member'): TeamMember {
  return { ...user, teamId, role, joinedAt: 1, removedAt: null };
}

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    teamId: teamA,
    title: '现有任务',
    description: null,
    descriptionJson: null,
    priority: 'medium',
    dueAt: null,
    tags: [],
    createdBy: leader.id,
    archivedAt: null,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    leaders: [leader, secondLeader],
    assignees: [{
      ...member,
      status: 'todo',
      latestNote: null,
      approvedBy: null,
      approvedAt: null,
      version: 1,
    }],
    ...overrides,
  };
}

interface DepsOptions {
  session?: typeof session | null;
  membership?: { team_id: string; role: 'leader' | 'member' } | null;
  members?: TeamMember[];
  seed?: (cache: ReturnType<typeof openTeamCache>) => void;
  online?: () => boolean;
}

function deps(options: DepsOptions = {}) {
  const cache = openTeamCache(join(mkdtempSync(join(tmpdir(), 'memex-team-service-')), 'team.db'));
  cache.replaceMembers(options.members ?? [
    memberRow(leader, teamA, 'leader'),
    memberRow(secondLeader, teamA, 'leader'),
    memberRow(member, teamA, 'member'),
  ]);
  cache.setTeam({ id: teamA, name: '当前团队' });
  options.seed?.(cache);

  const api = {} as TeamRemoteApi;
  const sync = { syncNow: vi.fn().mockResolvedValue({ phase: 'idle', pendingCount: 0, lastSyncedAt: 1, message: null }) };
  const membership = vi.fn().mockResolvedValue({
    data: options.membership === undefined ? { team_id: teamA, role: 'leader' } : options.membership,
    error: null,
  });
  const client = {
    getSession: vi.fn().mockResolvedValue(options.session === undefined ? session : options.session),
    getSupabase: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: membership }),
          }),
        }),
      }),
    }),
    signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
  };
  const realtime = { watch: vi.fn(), stop: vi.fn() };
  let nextId = 0;
  const randomId = vi.fn(() => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`);
  const service = createTeamService({
    client: client as never,
    cache,
    sync,
    api,
    realtime,
    now: () => 100,
    randomId,
    isOnline: options.online ?? (() => true),
  });
  return { cache, api, sync, service, client, membership, randomId, realtime };
}

function payload(cache: ReturnType<typeof openTeamCache>, type: string): Record<string, unknown> {
  const row = cache.listPending().find((item) => item.type === type);
  if (!row) throw new Error(`missing outbox row: ${type}`);
  return JSON.parse(row.payloadJson) as Record<string, unknown>;
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

  it('uses the same client note id in the cache and outbox', async () => {
    const { cache, service } = deps();
    const task = await service.createTask({
      title: '备注任务', assigneeIds: [leader.id], leaderIds: [secondLeader.id],
    });

    await service.addProgressNote(task.id, '进展');
    const progressNote = cache.listNotes(task.id)[0]!;
    expect(payload(cache, 'add_progress_note').noteId).toBe(progressNote.id);

    await service.startAssignee(task.id, 1);
    await service.submitAssignee(task.id, '请验收', 2);
    const submitNote = cache.listNotes(task.id)[1]!;
    expect(submitNote.id).not.toBe(progressNote.id);
    expect(payload(cache, 'submit_assignee').noteId).toBe(submitNote.id);
  });

  it('preserves cache and outbox when signing in as the same user', async () => {
    const task = makeTask();
    const { cache, service } = deps({
      seed: (target) => {
        target.setTeam({ id: teamA, name: '当前团队' });
        target.upsertTask(task);
        target.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
      },
    });

    await service.signIn({ email: 'leader@example.com', password: 'secret' });

    expect(cache.getTask(task.id)).not.toBeNull();
    expect(cache.listPending()).toHaveLength(1);
  });

  it('preserves cache when an expired previous auth refreshes the same cached user', async () => {
    const task = makeTask();
    const { cache, service, client } = deps({
      seed: (target) => {
        target.upsertTask(task);
        target.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
      },
    });
    await service.bootstrap();
    client.getSession
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(session);

    await service.signIn({ email: 'leader@example.com', password: 'secret' });

    expect(cache.getTask(task.id)).not.toBeNull();
    expect(cache.listPending()).toHaveLength(1);
  });
  it('clears cache when signing in as a different user', async () => {
    const task = makeTask();
    const otherSession = { userId: 'other-user', email: 'other@example.com', displayName: '其他用户' };
    const { cache, service, client, membership } = deps({
      seed: (target) => {
        target.setTeam({ id: teamA, name: '当前团队' });
        target.upsertTask(task);
      },
    });
    client.getSession
      .mockReset()
      .mockResolvedValueOnce(session)
      .mockResolvedValue(otherSession);
    membership.mockResolvedValue({ data: { team_id: teamB, role: 'leader' }, error: null });

    await service.signIn({ email: 'other@example.com', password: 'secret' });

    expect(cache.getTask(task.id)).toBeNull();
  });

  it('falls back to the cached session when membership refresh is offline', async () => {
    const { service, membership } = deps({
      seed: (target) => target.setTeam({ id: teamA, name: '当前团队' }),
    });
    await service.bootstrap();
    membership.mockRejectedValue(new Error('Failed to fetch'));

    const task = await service.createTask({
      title: '离线任务', assigneeIds: [member.id], leaderIds: [leader.id],
    });

    expect(task.title).toBe('离线任务');
  });

  it('clears stale cache and rejects a mutation after demotion', async () => {
    const task = makeTask();
    const { cache, service, membership } = deps({
      seed: (target) => {
        target.setTeam({ id: teamA, name: '当前团队' });
        target.upsertTask(task);
      },
    });
    await service.bootstrap();
    membership.mockResolvedValue({ data: { team_id: teamA, role: 'member' }, error: null });

    await expect(service.createTask({
      title: '降级后任务', assigneeIds: [member.id], leaderIds: [leader.id],
    })).rejects.toThrow();
    expect(cache.getTask(task.id)).toBeNull();
  });

  it('clears stale cache and rejects a mutation after removal', async () => {
    const task = makeTask();
    const { cache, service, membership } = deps({
      seed: (target) => {
        target.setTeam({ id: teamA, name: '当前团队' });
        target.upsertTask(task);
      },
    });
    await service.bootstrap();
    membership.mockResolvedValue({ data: null, error: null });

    await expect(service.updateTask(task.id, { title: '移除后更新', expectedVersion: 1 })).rejects.toThrow();
    expect(cache.getTask(task.id)).toBeNull();
  });

  it('returns an offline sync state when membership refresh cannot reach Supabase', async () => {
    const task = makeTask();
    const { cache, service, sync, membership } = deps({
      seed: (target) => {
        target.setTeam({ id: teamA, name: '当前团队' });
        target.upsertTask(task);
        target.enqueue('start_assignee', { taskId: task.id, expectedVersion: 1 }, 'op-1', 1);
        target.setMeta('lastSyncedAt', '50');
      },
    });
    await service.bootstrap();
    sync.syncNow.mockClear();
    membership.mockRejectedValue(new Error('Failed to fetch'));
    const states: unknown[] = [];
    const unsubscribe = service.onSyncState((value) => states.push(value));

    const state = await service.sync();

    expect(state).toEqual({ phase: 'offline', pendingCount: 1, lastSyncedAt: 50, message: '等待联网' });
    expect(states).toEqual([state]);
    expect(cache.getTask(task.id)).not.toBeNull();
    expect(sync.syncNow).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('clears stale cache when bootstrap sees a different team', async () => {
    const task = makeTask();
    const { cache, service, membership, sync } = deps({ seed: (target) => target.upsertTask(task) });
    cache.setTeam({ id: teamA, name: '旧团队' });
    membership.mockResolvedValue({ data: { team_id: teamB, role: 'leader' }, error: null });

    await service.bootstrap();

    expect(cache.getTask(task.id)).toBeNull();
    expect(cache.getTeam()).toBeNull();
    expect(sync.syncNow).toHaveBeenCalledWith(teamB);
  });

  it('clears stale cache when sync reloads a changed role', async () => {
    const task = makeTask();
    const { cache, service, membership, sync } = deps({ seed: (target) => target.upsertTask(task) });
    cache.setTeam({ id: teamA, name: '当前团队' });
    membership.mockResolvedValue({ data: { team_id: teamA, role: 'member' }, error: null });

    await service.sync();

    expect(cache.getTask(task.id)).toBeNull();
    expect(sync.syncNow).toHaveBeenCalledWith(teamA);
  });

  it('does not expose notes or events for an invisible task', async () => {
    const task = makeTask({
      assignees: [{
        ...secondLeader,
        status: 'todo',
        latestNote: null,
        approvedBy: null,
        approvedAt: null,
        version: 1,
      }],
    });
    const { service } = deps({
      session: memberSession,
      membership: { team_id: teamA, role: 'member' },
      seed: (cache) => cache.upsertTask(task),
    });

    await expect(service.getTaskNotes(task.id)).rejects.toThrow();
    await expect(service.getTaskEvents(task.id)).rejects.toThrow();
  });

  it('rejects non-leader lifecycle mutations', async () => {
    const task = makeTask();
    const { service } = deps({
      session: memberSession,
      membership: { team_id: teamA, role: 'member' },
      seed: (cache) => cache.upsertTask(task),
    });

    await expect(service.createTask({ title: '越权任务', assigneeIds: [member.id], leaderIds: [leader.id] })).rejects.toThrow();
    await expect(service.updateTask(task.id, { title: '越权更新', expectedVersion: 1 })).rejects.toThrow();
    await expect(service.reopenTask(task.id, 1)).rejects.toThrow();
    await expect(service.archiveTask(task.id, 1)).rejects.toThrow();
    await expect(service.closeAssignee(task.id, member.id, '越权关闭', 1)).rejects.toThrow();
  });

  it('rejects invalid assignee state transitions before optimistic writes', async () => {
    const submitted = makeTask({
      assignees: [{
        ...member,
        status: 'submitted',
        latestNote: null,
        approvedBy: null,
        approvedAt: null,
        version: 3,
      }],
    });
    const { service } = deps({
      session: memberSession,
      membership: { team_id: teamA, role: 'member' },
      seed: (cache) => cache.upsertTask(submitted),
    });

    await expect(service.startAssignee(submitted.id, 3)).rejects.toThrow();
    await expect(service.submitAssignee(submitted.id, '重复提交', 3)).rejects.toThrow();
    await expect(service.addProgressNote(submitted.id, '已提交后仍可补充进展')).resolves.toBeUndefined();
  });

  it('returns the cached session without reloading auth once signed in', async () => {
    const { service, client } = deps();

    const bootstrapped = await service.bootstrap();
    expect(client.getSession).toHaveBeenCalledTimes(1);

    await expect(service.getSession()).resolves.toEqual(bootstrapped.session);
    expect(client.getSession).toHaveBeenCalledTimes(1);
  });

  it('requires a non-empty note when submitting and rejects review before submission', async () => {
    const doing = makeTask({
      assignees: [{
        ...member,
        status: 'doing',
        latestNote: null,
        approvedBy: null,
        approvedAt: null,
        version: 2,
      }],
    });
    const memberDeps = deps({
      session: memberSession,
      membership: { team_id: teamA, role: 'member' },
      seed: (cache) => cache.upsertTask(doing),
    });
    await expect(memberDeps.service.submitAssignee(doing.id, '   ', 2)).rejects.toThrow();

    const leaderDeps = deps({ seed: (cache) => cache.upsertTask(doing) });
    await expect(leaderDeps.service.reviewAssignee(doing.id, member.id, 'approve', null, 2)).rejects.toThrow();
  });
});
