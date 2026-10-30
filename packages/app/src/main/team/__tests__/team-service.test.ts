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
}

function deps(options: DepsOptions = {}) {
  const cache = openTeamCache(join(mkdtempSync(join(tmpdir(), 'memex-team-service-')), 'team.db'));
  cache.replaceMembers(options.members ?? [
    memberRow(leader, teamA, 'leader'),
    memberRow(secondLeader, teamA, 'leader'),
    memberRow(member, teamA, 'member'),
  ]);
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
    isOnline: () => true,
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

  it('clears a previous cache after a successful sign-in', async () => {
    const task = makeTask();
    const { cache, service } = deps({ seed: (target) => target.upsertTask(task) });

    await service.signIn({ email: 'leader@example.com', password: 'secret' });

    expect(cache.getTask(task.id)).toBeNull();
    expect(cache.listPending()).toEqual([]);
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
