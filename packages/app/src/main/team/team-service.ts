import {
  canApproveAssignee,
  hasNonAssigneeApprover,
  type TeamBootstrap,
  type TeamCreateInput,
  type TeamInvite,
  type TeamInviteCreateInput,
  type TeamJoinInput,
  type TeamMemberEvent,
  type TeamNotification,
  type TeamOutboxFailure,
  type TeamProgressNote,
  type TeamRolePatch,
  type TeamSessionInfo,
  type TeamSignInInput,
  type TeamSignUpInput,
  type TeamSyncState,
  type TeamTask,
  type TeamTaskEvent,
  type TeamTaskFilter,
  type TeamTaskInput,
  type TeamTaskPatch,
} from '@memex/shared';
import type { TeamCache } from './team-cache.js';
import type { TeamClient } from './team-client.js';
import type { TeamRealtime } from './team-realtime.js';
import type { TeamRemoteApi, TeamSync } from './team-sync.js';

export interface TeamService {
  getSession(): Promise<TeamSessionInfo>;
  bootstrap(): Promise<TeamBootstrap>;
  signIn(input: TeamSignInInput): Promise<TeamBootstrap>;
  signUp(input: TeamSignUpInput): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  createTeam(input: TeamCreateInput): Promise<TeamBootstrap>;
  joinTeam(input: TeamJoinInput): Promise<TeamBootstrap>;
  listTasks(filter?: TeamTaskFilter): Promise<TeamTask[]>;
  listNotifications(): Promise<TeamNotification[]>;
  listMemberEvents(): Promise<TeamMemberEvent[]>;
  getTask(id: string): Promise<TeamTask | null>;
  getTaskNotes(taskId: string): Promise<TeamProgressNote[]>;
  getTaskEvents(taskId: string): Promise<TeamTaskEvent[]>;
  createTask(input: TeamTaskInput): Promise<TeamTask>;
  updateTask(id: string, patch: TeamTaskPatch): Promise<TeamTask>;
  startAssignee(taskId: string, expectedVersion: number): Promise<void>;
  addProgressNote(taskId: string, body: string): Promise<void>;
  submitAssignee(taskId: string, body: string, expectedVersion: number): Promise<void>;
  reviewAssignee(
    taskId: string,
    assigneeId: string,
    decision: 'approve' | 'return',
    note: string | null,
    expectedVersion: number,
  ): Promise<void>;
  reopenTask(taskId: string, expectedVersion: number): Promise<void>;
  archiveTask(taskId: string, expectedVersion: number): Promise<void>;
  closeAssignee(taskId: string, assigneeId: string, reason: string, expectedVersion: number): Promise<void>;
  createInvite(input: TeamInviteCreateInput): Promise<string>;
  listInvites(): Promise<TeamInvite[]>;
  revokeInvite(inviteId: string): Promise<void>;
  setMemberRole(patch: TeamRolePatch): Promise<void>;
  removeMember(userId: string): Promise<void>;
  leaveTeam(): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  listOutboxFailures(): Promise<TeamOutboxFailure[]>;
  retryOutbox(id: string): Promise<void>;
  discardOutbox(id: string): Promise<void>;
  sync(): Promise<TeamSyncState>;
  onSyncState(callback: (state: TeamSyncState) => void): () => void;
}

interface ServiceOptions {
  client: TeamClient;
  cache: TeamCache;
  sync: TeamSync;
  api: TeamRemoteApi;
  now: () => number;
  randomId: () => string;
  isOnline: () => boolean;
  realtime?: TeamRealtime;
}

const signedOutSession = (): TeamSessionInfo => ({
  signedIn: false,
  userId: null,
  email: null,
  displayName: null,
  teamId: null,
  role: null,
});

export function createTeamService({
  client,
  cache,
  sync,
  api,
  now,
  randomId,
  isOnline,
  realtime,
}: ServiceOptions): TeamService {
  let session: TeamSessionInfo = signedOutSession();
  const listeners = new Set<(state: TeamSyncState) => void>();
  const emit = (state: TeamSyncState) => listeners.forEach((listener) => listener(state));

  type ActiveSession = TeamSessionInfo & {
    userId: string;
    teamId: string;
    role: 'leader' | 'member';
  };

  const cacheMatchesSession = (current: TeamSessionInfo): boolean => {
    if (!current.userId || !current.teamId || !current.role) return false;
    if (cache.getTeam()?.id !== current.teamId) return false;
    return cache.listMembers().some(
      (member) => member.id === current.userId && member.role === current.role && member.removedAt === null,
    );
  };

  const reconcileCache = (current: TeamSessionInfo, previous: TeamSessionInfo) => {
    const scopeChanged = previous.signedIn && (
      previous.userId !== current.userId
      || previous.teamId !== current.teamId
    );
    const roleChanged = previous.signedIn
      && previous.userId === current.userId
      && previous.teamId === current.teamId
      && previous.role !== current.role;
    const cachedTeam = cache.getTeam();
    const cachedTeamMismatch = cachedTeam !== null && cachedTeam.id !== current.teamId;
    if (!current.signedIn || !current.teamId || !current.role || scopeChanged || cachedTeamMismatch) {
      cache.clear();
    } else if (roleChanged || !cacheMatchesSession(current)) {
      cache.clearAuthorizationData();
    }
  };

  const offlineSyncState = (): TeamSyncState => {
    const raw = cache.getMeta('lastSyncedAt');
    const lastSyncedAt = raw === null ? null : Number(raw);
    return {
      phase: 'offline',
      pendingCount: cache.countOutbox(),
      lastSyncedAt: Number.isFinite(lastSyncedAt) ? lastSyncedAt : null,
      message: '等待联网',
    };
  };

  const cachedSessionFor = (auth: { userId: string; email: string; displayName: string } | null) => {
    const cached = cache.getSessionInfo();
    if (!cached?.signedIn) return null;
    if (auth && cached.userId !== auth.userId) return null;
    if (cached.teamId && cache.getTeam()?.id !== cached.teamId) return null;
    return auth
      ? { ...cached, email: auth.email, displayName: auth.displayName }
      : cached;
  };

  const watchSession = (current: TeamSessionInfo) => {
    const teamId = current.teamId;
    if (teamId) {
      realtime?.watch(teamId, () => {
        void sync
          .syncNow(teamId)
          .then(emit)
          .catch(() => undefined);
      });
    } else {
      realtime?.stop();
    }
  };

  const loadSession = async (): Promise<TeamSessionInfo> => {
    let auth: Awaited<ReturnType<TeamClient['getSession']>>;
    try {
      auth = await client.getSession();
    } catch (error) {
      const cached = cachedSessionFor(null);
      if (cached) {
        session = cached;
        watchSession(session);
        return session;
      }
      throw error;
    }
    if (!auth) {
      realtime?.stop();
      session = signedOutSession();
      return session;
    }

    let data: { team_id: string; role: 'leader' | 'member' } | null = null;
    try {
      const result = await client
        .getSupabase()
        .from('team_members')
        .select('team_id, role')
        .eq('user_id', auth.userId)
        .eq('status', 'active')
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      data = result.data;
    } catch (error) {
      const cached = cachedSessionFor(auth);
      if (!cached) throw error;
      session = cached;
      cache.setSessionInfo(session);
      watchSession(session);
      return session;
    }

    session = {
      signedIn: true,
      userId: auth.userId,
      email: auth.email,
      displayName: auth.displayName,
      teamId: data?.team_id ?? null,
      role: data?.role ?? null,
    };
    cache.setSessionInfo(session);
    watchSession(session);
    return session;
  };

  const bootstrap = async (): Promise<TeamBootstrap> => {
    const previous = session;
    const current = await loadSession();
    reconcileCache(current, previous);
    if (!current.signedIn || !current.teamId || !current.role) {
      return {
        session: current,
        team: null,
        members: [],
        tasks: [],
        notifications: [],
        memberEvents: [],
        outboxFailures: [],
        sync: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
      };
    }
    const state = await sync.syncNow(current.teamId);
    emit(state);
    return {
      session: current,
      team: cache.getTeam(),
      members: cache.listMembers(),
      tasks: cache.listTasks({ view: 'all' }, current.userId!, current.role, now()),
      notifications: cache.listNotifications(current.userId!),
      memberEvents: cache.listMemberEvents(),
      outboxFailures: cache.listFailed().map(({ id, type, attempts, lastError, createdAt }) => ({
        id,
        type,
        attempts,
        lastError,
        createdAt,
      })),
      sync: state,
    };
  };

  const requireSession = async (): Promise<ActiveSession> => {
    let current = session;
    if (isOnline()) {
      const previous = session;
      try {
        current = await loadSession();
        reconcileCache(current, previous);
      } catch (error) {
        if (!session.signedIn) throw error;
        current = session;
      }
    }
    if (!current.signedIn || !current.userId || !current.teamId || !current.role) {
      throw new Error('请先登录并加入团队');
    }
    return current as ActiveSession;
  };

  const requireLeader = (current: ActiveSession) => {
    if (current.role !== 'leader') throw new Error('仅团队领导可执行此操作');
  };

  const isTaskEditor = (task: TeamTask, userId: string) =>
    task.createdBy === userId || task.leaders.some((leader) => leader.id === userId);

  const requireTaskEditor = (current: ActiveSession, task: TeamTask) => {
    requireLeader(current);
    if (!isTaskEditor(task, current.userId)) throw new Error('无权修改任务');
  };

  const requireOpenTask = (task: TeamTask) => {
    if (task.archivedAt !== null) throw new Error('任务已归档');
  };

  const requireTaskVersion = (task: TeamTask, expectedVersion: number) => {
    if (task.version !== expectedVersion) throw new Error('任务版本已变化，请刷新');
  };

  const requireAssignee = (task: TeamTask, userId: string) => {
    const assignee = task.assignees.find((item) => item.id === userId);
    if (!assignee) throw new Error('无权更新此分项');
    return assignee;
  };

  const requireAssigneeVersion = (version: number, expectedVersion: number) => {
    if (version !== expectedVersion) throw new Error('分项版本已变化，请刷新');
  };

  const activeLeaderIds = () => cache
    .listMembers()
    .filter((member) => member.role === 'leader' && member.removedAt === null)
    .map((member) => member.id);

  const affectedTasksForMember = (userId: string) => cache
    .listTasks({ view: 'all' }, session.userId ?? '', session.role ?? 'member', now())
    .filter((task) => task.createdBy === userId || task.leaders.some((leader) => leader.id === userId));

  const requireDemotionSafe = (userId: string) => {
    const remainingLeaders = new Set(activeLeaderIds().filter((id) => id !== userId));
    for (const task of affectedTasksForMember(userId)) {
      const nextLeaderIds = task.leaders
        .map((leader) => leader.id)
        .filter((id) => id !== userId && remainingLeaders.has(id));
      if (!hasNonAssigneeApprover(task.assignees.map((item) => item.id), nextLeaderIds)) {
        throw new Error('至少需要一名非执行人的审批领导');
      }
    }
  };

  const findVisibleTask = async (id: string): Promise<TeamTask | null> => {
    const current = await requireSession();
    const task = cache.getTask(id);
    if (!task) return null;
    return current.role === 'leader' || task.assignees.some((item) => item.id === current.userId) ? task : null;
  };

  const queue = (type: string, payload: unknown) => {
    cache.enqueue(type, payload, randomId(), now());
  };

  const queueTask = (type: 'create_task' | 'update_task', task: TeamTask, expectedVersion?: number) => {
    queue(type, { task, expectedVersion });
  };

  const replaceTask = (task: TeamTask) => cache.upsertTask(task);

  return {
    async getSession() {
      return session.signedIn ? session : loadSession();
    },
    bootstrap,
    async signIn(input) {
      const previousAuth = await client.getSession();
      await client.signIn(input.email, input.password);
      const currentAuth = await client.getSession();
      const previousUserId = previousAuth?.userId ?? session.userId;
      if (!currentAuth || previousUserId !== currentAuth.userId) {
        realtime?.stop();
        cache.clear();
        session = signedOutSession();
      }
      return bootstrap();
    },
    async signUp(input) {
      return client.signUp(input.email, input.password, input.displayName);
    },
    async signOut() {
      await client.signOut();
      realtime?.stop();
      cache.clear();
      session = signedOutSession();
    },
    async createTeam(input) {
      const auth = await client.getSession();
      if (!auth) throw new Error('请先登录');
      const teamId = randomId();
      await api.createTeam(randomId(), teamId, input.name, auth.displayName);
      return bootstrap();
    },
    async joinTeam(input) {
      const auth = await client.getSession();
      if (!auth) throw new Error('请先登录');
      await api.acceptInvite(randomId(), input.token, auth.displayName);
      return bootstrap();
    },
    async listTasks(filter = {}) {
      const current = await requireSession();
      return cache.listTasks(filter, current.userId, current.role, now());
    },
    async listNotifications() {
      const current = await requireSession();
      return cache.listNotifications(current.userId);
    },
    async listMemberEvents() {
      const current = await requireSession();
      requireLeader(current);
      return cache.listMemberEvents();
    },
    async getTask(id) {
      return findVisibleTask(id);
    },
    async getTaskNotes(taskId) {
      const task = await findVisibleTask(taskId);
      if (!task) throw new Error('任务不存在或无权限');
      return cache.listNotes(taskId);
    },
    async getTaskEvents(taskId) {
      const task = await findVisibleTask(taskId);
      if (!task) throw new Error('任务不存在或无权限');
      return cache.listEvents(taskId);
    },
    async createTask(input) {
      const current = await requireSession();
      requireLeader(current);
      const leaderIds = [...new Set([current.userId, ...input.leaderIds])];
      const assigneeIds = [...new Set(input.assigneeIds)];
      if (!hasNonAssigneeApprover(assigneeIds, leaderIds)) {
        throw new Error('至少需要一名非执行人的审批领导');
      }
      const members = cache.listMembers();
      const leaders = leaderIds
        .map((id) => members.find((item) => item.id === id))
        .filter((item) => item !== undefined);
      const assignees = assigneeIds
        .map((id) => members.find((item) => item.id === id))
        .filter((item) => item !== undefined);
      if (
        leaders.length !== leaderIds.length
        || assignees.length !== assigneeIds.length
        || leaders.some((leader) => leader.role !== 'leader' || leader.removedAt !== null)
        || assignees.some((assignee) => assignee.removedAt !== null)
      ) {
        throw new Error('成员列表已变化，请刷新');
      }
      const timestamp = now();
      const task: TeamTask = {
        id: randomId(),
        teamId: current.teamId,
        title: input.title,
        description: input.description ?? null,
        descriptionJson: input.descriptionJson ?? null,
        priority: input.priority ?? 'medium',
        dueAt: input.dueAt ?? null,
        tags: input.tags ?? [],
        createdBy: current.userId,
        archivedAt: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        leaders,
        assignees: assignees.map((member) => ({
          id: member.id,
          email: member.email,
          displayName: member.displayName,
          status: 'todo',
          latestNote: null,
          approvedBy: null,
          approvedAt: null,
          version: 1,
        })),
      };
      replaceTask(task);
      queueTask('create_task', task);
      emit(await sync.syncNow(current.teamId));
      return task;
    },
    async updateTask(id, patch) {
      const current = await requireSession();
      const existing = cache.getTask(id);
      if (!existing) throw new Error('任务不存在');
      requireTaskEditor(current, existing);
      requireOpenTask(existing);
      requireTaskVersion(existing, patch.expectedVersion);
      const { expectedVersion, assigneeIds, leaderIds, ...fields } = patch;
      const next: TeamTask = {
        ...existing,
        ...fields,
        id,
        teamId: existing.teamId,
        createdBy: existing.createdBy,
        version: expectedVersion + 1,
        updatedAt: now(),
      };
      if (assigneeIds || leaderIds) {
        const members = cache.listMembers();
        if (leaderIds) {
          const nextLeaderIds = [...new Set(leaderIds)];
          const leaders = nextLeaderIds
            .map((memberId) => members.find((item) => item.id === memberId))
            .filter((item) => item !== undefined);
          if (
            leaders.length !== nextLeaderIds.length
            || leaders.some((leader) => leader.role !== 'leader' || leader.removedAt !== null)
          ) {
            throw new Error('成员列表已变化，请刷新');
          }
          next.leaders = leaders;
        }
        if (assigneeIds) {
          const assignees = assigneeIds
            .map((memberId) => members.find((item) => item.id === memberId))
            .filter((item) => item !== undefined);
          if (assignees.length !== assigneeIds.length || assignees.some((assignee) => assignee.removedAt !== null)) {
            throw new Error('成员列表已变化，请刷新');
          }
          if (existing.assignees.some(
            (assignee) => !assigneeIds.includes(assignee.id) && !['approved', 'closed'].includes(assignee.status),
          )) {
            throw new Error('存在未完成的分项，无法移除执行人');
          }
          next.assignees = assigneeIds.map((memberId) => {
            const old = existing.assignees.find((item) => item.id === memberId);
            const member = members.find((item) => item.id === memberId);
            return old ?? {
              id: memberId,
              email: member?.email ?? '',
              displayName: member?.displayName ?? '',
              status: 'todo',
              latestNote: null,
              approvedBy: null,
              approvedAt: null,
              version: 1,
            };
          });
        }
      }
      const members = cache.listMembers();
      const activeMembers = new Set(members.filter((member) => member.removedAt === null).map((member) => member.id));
      const activeLeaders = new Set(activeLeaderIds());
      if (
        next.leaders.some((leader) => !activeLeaders.has(leader.id))
        || next.assignees.some((assignee) => !activeMembers.has(assignee.id))
      ) {
        throw new Error('成员列表已变化，请刷新');
      }
      if (!hasNonAssigneeApprover(
        next.assignees.map((item) => item.id),
        next.leaders.map((item) => item.id),
      )) {
        throw new Error('至少需要一名非执行人的审批领导');
      }
      replaceTask(next);
      queueTask('update_task', next, expectedVersion);
      emit(await sync.syncNow(current.teamId));
      return next;
    },
    async startAssignee(taskId, expectedVersion) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireOpenTask(task);
      const assignee = requireAssignee(task, current.userId);
      requireAssigneeVersion(assignee.version, expectedVersion);
      if (assignee.status !== 'todo' && assignee.status !== 'doing') {
        throw new Error('当前分项状态不允许开始');
      }
      replaceTask({
        ...task,
        assignees: task.assignees.map((item) =>
          item.id === current.userId ? { ...item, status: 'doing', version: item.version + 1 } : item),
      });
      queue('start_assignee', { taskId, expectedVersion });
      emit(await sync.syncNow(current.teamId));
    },
    async addProgressNote(taskId, body) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireOpenTask(task);
      const assignee = requireAssignee(task, current.userId);
      if (!['todo', 'doing', 'submitted'].includes(assignee.status)) {
        throw new Error('当前分项状态不允许添加进展');
      }
      if (!body.trim()) throw new Error('进展内容不能为空');
      const noteId = randomId();
      cache.appendNote({ id: noteId, taskId, userId: current.userId, body, createdAt: now() });
      replaceTask({
        ...task,
        assignees: task.assignees.map((item) =>
          item.id === current.userId ? { ...item, latestNote: body } : item),
      });
      queue('add_progress_note', { taskId, noteId, body });
      emit(await sync.syncNow(current.teamId));
    },
    async submitAssignee(taskId, body, expectedVersion) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireOpenTask(task);
      const assignee = requireAssignee(task, current.userId);
      requireAssigneeVersion(assignee.version, expectedVersion);
      if (assignee.status !== 'doing') throw new Error('当前分项状态不允许提交');
      if (!body.trim()) throw new Error('提交说明不能为空');
      const noteId = randomId();
      cache.appendNote({ id: noteId, taskId, userId: current.userId, body, createdAt: now() });
      replaceTask({
        ...task,
        assignees: task.assignees.map((item) =>
          item.id === current.userId
            ? { ...item, status: 'submitted', latestNote: body, version: item.version + 1 }
            : item),
      });
      queue('submit_assignee', { taskId, noteId, body, expectedVersion });
      emit(await sync.syncNow(current.teamId));
    },
    async reviewAssignee(taskId, assigneeId, decision, note, expectedVersion) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireOpenTask(task);
      if (!canApproveAssignee(task, current.userId, assigneeId, activeLeaderIds())) {
        throw new Error('无权验收此分项');
      }
      const assignee = requireAssignee(task, assigneeId);
      requireAssigneeVersion(assignee.version, expectedVersion);
      if (assignee.status !== 'submitted') throw new Error('仅已提交的分项可验收');
      replaceTask({
        ...task,
        assignees: task.assignees.map((item) => item.id === assigneeId ? {
          ...item,
          status: decision === 'approve' ? 'approved' : 'doing',
          approvedBy: decision === 'approve' ? current.userId : null,
          approvedAt: decision === 'approve' ? now() : null,
          version: item.version + 1,
        } : item),
      });
      queue('review_assignee', { taskId, assigneeId, decision, note, expectedVersion });
      emit(await sync.syncNow(current.teamId));
    },
    async reopenTask(taskId, expectedVersion) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireTaskEditor(current, task);
      requireOpenTask(task);
      requireTaskVersion(task, expectedVersion);
      if (task.assignees.length === 0 || task.assignees.some(
        (assignee) => assignee.status !== 'approved' && assignee.status !== 'closed',
      )) {
        throw new Error('仅已完成或已关闭的分项可重新打开');
      }
      const activeMembers = new Set(
        cache.listMembers().filter((member) => member.removedAt === null).map((member) => member.id),
      );
      const leaders = new Set(activeLeaderIds());
      if (
        task.assignees.some((assignee) => assignee.status === 'approved' && !activeMembers.has(assignee.id))
        || task.leaders.some((leader) => !leaders.has(leader.id))
      ) {
        throw new Error('成员列表已变化，请刷新');
      }
      replaceTask({
        ...task,
        archivedAt: null,
        version: expectedVersion + 1,
        assignees: task.assignees.map((item) =>
          item.status === 'approved' ? { ...item, status: 'doing', version: item.version + 1 } : item),
      });
      queue('reopen_task', { taskId, expectedVersion });
      emit(await sync.syncNow(current.teamId));
    },
    async archiveTask(taskId, expectedVersion) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireTaskEditor(current, task);
      if (task.archivedAt !== null) throw new Error('任务已归档');
      requireTaskVersion(task, expectedVersion);
      replaceTask({ ...task, archivedAt: now(), version: expectedVersion + 1 });
      queue('archive_task', { taskId, expectedVersion });
      emit(await sync.syncNow(current.teamId));
    },
    async closeAssignee(taskId, assigneeId, reason, expectedVersion) {
      const current = await requireSession();
      const task = cache.getTask(taskId);
      if (!task) throw new Error('任务不存在');
      requireTaskEditor(current, task);
      requireOpenTask(task);
      const assignee = requireAssignee(task, assigneeId);
      requireAssigneeVersion(assignee.version, expectedVersion);
      if (assignee.status === 'approved') throw new Error('已通过的分项不能关闭');
      replaceTask({
        ...task,
        assignees: task.assignees.map((item) =>
          item.id === assigneeId ? { ...item, status: 'closed', version: item.version + 1 } : item),
      });
      queue('close_assignee', { taskId, assigneeId, reason, expectedVersion });
      emit(await sync.syncNow(current.teamId));
    },
    async createInvite(input) {
      const current = await requireSession();
      requireLeader(current);
      if (!isOnline()) throw new Error('创建邀请需要联网');
      return api.createInvite(randomId(), current.teamId, input.email, now() + input.expiresInHours * 3_600_000);
    },
    async listInvites() {
      const current = await requireSession();
      requireLeader(current);
      if (!isOnline()) throw new Error('查看邀请需要联网');
      return api.listInvites(current.teamId);
    },
    async revokeInvite(inviteId) {
      const current = await requireSession();
      requireLeader(current);
      queue('revoke_invite', { inviteId });
      emit(await sync.syncNow(current.teamId));
    },
    async setMemberRole(patch) {
      const current = await requireSession();
      requireLeader(current);
      const target = cache.listMembers().find(
        (member) => member.id === patch.userId && member.removedAt === null,
      );
      if (!target) throw new Error('成员不存在');
      if (target.role === 'leader' && patch.role === 'member') requireDemotionSafe(patch.userId);

      cache.replaceMembers(cache.listMembers().map((member) =>
        member.id === patch.userId ? { ...member, role: patch.role } : member));
      if (patch.role === 'member') {
        for (const task of affectedTasksForMember(patch.userId)) {
          replaceTask({
            ...task,
            leaders: task.leaders.filter((leader) => leader.id !== patch.userId),
          });
        }
      }
      queue('set_member_role', { teamId: current.teamId, userId: patch.userId, role: patch.role });
      emit(await sync.syncNow(current.teamId));
    },
    async removeMember(userId) {
      const current = await requireSession();
      requireLeader(current);
      if (userId === current.userId) throw new Error('请使用退出团队');
      const target = cache.listMembers().find(
        (member) => member.id === userId && member.removedAt === null,
      );
      if (!target) throw new Error('成员不存在');
      if (target.role === 'leader' && activeLeaderIds().length <= 1) throw new Error('不能移除最后一名领导');
      const tasks = cache.listTasks({ view: 'all' }, current.userId, current.role, now());
      if (tasks.some((task) => task.assignees.some(
        (assignee) => assignee.id === userId && !['approved', 'closed'].includes(assignee.status),
      ))) {
        throw new Error('成员仍有未完成的分项，请先关闭');
      }
      if (tasks.some((task) => task.leaders.some((leader) => leader.id === userId))) {
        throw new Error('成员仍负责任务，请先转移领导');
      }
      queue('remove_member', { teamId: current.teamId, userId });
      emit(await sync.syncNow(current.teamId));
    },
    async leaveTeam() {
      const current = await requireSession();
      if (!isOnline()) throw new Error('退出团队需要联网');
      await api.leaveTeam(randomId(), current.teamId);
      realtime?.stop();
      cache.clear();
      session = {
        signedIn: true,
        userId: current.userId,
        email: current.email,
        displayName: current.displayName,
        teamId: null,
        role: null,
      };
      cache.setSessionInfo(session);
    },
    async markNotificationRead(id) {
      const current = await requireSession();
      const notification = cache.listNotifications(current.userId).find((item) => item.id === id);
      if (!notification) throw new Error('通知不存在');
      cache.upsertNotification({ ...notification, readAt: now() });
      if (id.startsWith('local:')) return;
      queue('mark_notification_read', { notificationId: id });
      emit(await sync.syncNow(current.teamId));
    },
    async listOutboxFailures() {
      await requireSession();
      return cache.listFailed().map(({ id, type, attempts, lastError, createdAt }) => ({
        id,
        type,
        attempts,
        lastError,
        createdAt,
      }));
    },
    async retryOutbox(id) {
      const current = await requireSession();
      if (!cache.retryOutbox(id)) throw new Error('失败操作不存在');
      emit(await sync.syncNow(current.teamId));
    },
    async discardOutbox(id) {
      const current = await requireSession();
      if (!cache.discardOutbox(id)) throw new Error('失败操作不存在');
      emit(await sync.syncNow(current.teamId));
    },
    async sync() {
      if (!isOnline()) {
        const state = offlineSyncState();
        emit(state);
        return state;
      }
      const previous = session;
      let current: TeamSessionInfo;
      try {
        current = await loadSession();
      } catch {
        const state = offlineSyncState();
        emit(state);
        return state;
      }
      reconcileCache(current, previous);
      if (!current.signedIn || !current.userId || !current.teamId || !current.role) {
        throw new Error('请先登录并加入团队');
      }
      const state = await sync.syncNow(current.teamId);
      emit(state);
      return state;
    },
    onSyncState(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

export function createUnavailableTeamService(): TeamService {
  return new Proxy({} as TeamService, {
    get(_target, property) {
      if (property === 'onSyncState') return () => () => undefined;
      return async () => {
        throw new Error('团队服务未配置');
      };
    },
  });
}
