import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type {
  TeamBootstrap,
  TeamCreateInput,
  TeamInvite,
  TeamInviteCreateInput,
  TeamJoinInput,
  TeamMember,
  TeamMemberEvent,
  TeamNotification,
  TeamOutboxFailure,
  TeamProgressNote,
  TeamRolePatch,
  TeamSessionInfo,
  TeamSignInInput,
  TeamSignUpInput,
  TeamSyncState,
  TeamTask,
  TeamTaskEvent,
  TeamTaskInput,
  TeamTaskPatch,
  TeamTaskView,
} from '@memex/shared';

export interface TeamState {
  session: TeamSessionInfo;
  team: { id: string; name: string } | null;
  members: TeamMember[];
  tasks: TeamTask[];
  activeTask: TeamTask | null;
  notes: TeamProgressNote[];
  events: TeamTaskEvent[];
  notifications: TeamNotification[];
  memberEvents: TeamMemberEvent[];
  outboxFailures: TeamOutboxFailure[];
  syncState: TeamSyncState;
  loading: boolean;
  error: string | null;
  view: TeamTaskView;
  memberFilter: string | null;
  bootstrap(): Promise<void>;
  signIn(input: TeamSignInInput): Promise<void>;
  signUp(input: TeamSignUpInput): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  createTeam(input: TeamCreateInput): Promise<void>;
  joinTeam(input: TeamJoinInput): Promise<void>;
  setView(view: TeamTaskView): Promise<void>;
  setMemberFilter(memberId: string | null): Promise<void>;
  selectTask(id: string | null): Promise<void>;
  refresh(): Promise<void>;
  createTask(input: TeamTaskInput): Promise<TeamTask>;
  updateTask(id: string, patch: TeamTaskPatch): Promise<void>;
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
  retryOutbox(id: string): Promise<void>;
  discardOutbox(id: string): Promise<void>;
  syncNow(): Promise<void>;
}

const signedOut: TeamSessionInfo = {
  signedIn: false,
  userId: null,
  email: null,
  displayName: null,
  teamId: null,
  role: null,
};
const idleSync: TeamSyncState = { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null };

const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
};

export function createTeamStore(): UseBoundStore<StoreApi<TeamState>> {
  return create<TeamState>((set, get) => {
    let unsubscribeSync: (() => void) | null = null;
    let reloadRequestId = 0;
    let selectTaskRequestId = 0;
    let completedSelectTaskRequestId = 0;

    const invalidateTaskRequests = () => {
      reloadRequestId += 1;
      selectTaskRequestId += 1;
      completedSelectTaskRequestId = selectTaskRequestId;
    };

    const apply = (value: TeamBootstrap) => {
      const state = get();
      const identityChanged =
        state.session.signedIn !== value.session.signedIn ||
        state.session.userId !== value.session.userId ||
        state.session.teamId !== value.session.teamId ||
        state.session.role !== value.session.role ||
        state.team?.id !== value.team?.id;
      if (identityChanged) invalidateTaskRequests();
      const view = identityChanged || value.session.role !== 'leader'
        ? state.view === 'pending_review' ? 'all' : state.view
        : state.view;
      const memberFilter = identityChanged || value.session.role !== 'leader'
        ? null
        : state.memberFilter;
      set({
        session: value.session,
        team: value.team,
        members: value.members,
        tasks: value.tasks,
        notifications: value.notifications,
        memberEvents: value.memberEvents,
        outboxFailures: value.outboxFailures,
        syncState: value.sync,
        loading: false,
        error: null,
        view,
        memberFilter,
        ...(identityChanged ? { activeTask: null, notes: [], events: [] } : {}),
      });
    };

    const run = async <T,>(
      action: () => Promise<T>,
      isCurrent: () => boolean = () => true,
    ): Promise<T> => {
      if (isCurrent()) set({ error: null });
      try {
        return await action();
      } catch (error) {
        if (isCurrent()) set({ error: errorMessage(error) });
        throw error;
      }
    };

    const bootstrapNow = async () => {
      set({ loading: true });
      try {
        apply(await run(() => window.memex.team.bootstrap()));
      } catch (error) {
        set({ loading: false });
        throw error;
      }
    };
    const refreshOutboxFailures = async () => {
      const outboxFailures = await window.memex.team.listOutboxFailures();
      set({ outboxFailures });
    };
    const resetTeamWorkspace = (nextSession: TeamSessionInfo) => {
      invalidateTaskRequests();
      set({
        session: nextSession,
        team: null,
        members: [],
        tasks: [],
        activeTask: null,
        notes: [],
        events: [],
        notifications: [],
        memberEvents: [],
        outboxFailures: [],
        syncState: idleSync,
        loading: false,
        error: null,
        view: 'all',
        memberFilter: null,
      });
    };
    const reload = async () => {
      const requestId = ++reloadRequestId;
      const isCurrent = () => requestId === reloadRequestId;
      const state = get();
      try {
        await run(async () => {
          const sessionSnapshot = await window.memex.team.refreshSession();
          if (!isCurrent()) return;
          if (!sessionSnapshot.signedIn || !sessionSnapshot.userId || !sessionSnapshot.teamId || !sessionSnapshot.role) {
            resetTeamWorkspace(sessionSnapshot);
            return;
          }
          try {
            const members = await window.memex.team.listMembers();
            if (!isCurrent()) return;
            const currentMember = members.find((member) => member.id === sessionSnapshot.userId);
            if (!currentMember) throw new Error('无法确认当前成员角色，请刷新重试');
            const role = currentMember.role;
            const view = role === 'leader' || state.view !== 'pending_review' ? state.view : 'all';
            const memberFilter = role === 'leader' ? state.memberFilter : null;
            const [tasks, notifications, memberEvents] = await Promise.all([
              window.memex.team.listTasks({ view, memberId: memberFilter ?? undefined }),
              window.memex.team.listNotifications(),
              role === 'leader'
                ? window.memex.team.listMemberEvents()
                : Promise.resolve(null),
            ]);
            if (!isCurrent()) return;
            const currentActiveTaskId = get().activeTask?.id ?? null;
            const activeTask = currentActiveTaskId
              ? tasks.find((task) => task.id === currentActiveTaskId) ?? null
              : null;
            set({
              session: { ...sessionSnapshot, role },
              view,
              memberFilter,
              tasks,
              notifications,
              members,
              memberEvents: role === 'leader' ? memberEvents ?? [] : [],
              activeTask,
              ...(activeTask ? {} : { notes: [], events: [] }),
            });
          } catch (error) {
            if (!isCurrent()) throw error;
            const role = sessionSnapshot.role;
            const view = role === 'leader' || get().view !== 'pending_review' ? get().view : 'all';
            set({
              session: sessionSnapshot,
              view,
              memberFilter: role === 'leader' ? get().memberFilter : null,
              memberEvents: role === 'leader' ? get().memberEvents : [],
              ...(role === 'leader'
                ? {}
                : {
                    members: [],
                    tasks: [],
                    activeTask: null,
                    notes: [],
                    events: [],
                    notifications: [],
                  }),
            });
            throw error;
          }
        }, isCurrent);
      } catch (error) {
        if (isCurrent()) throw error;
      }
    };
    const reselectTaskIfActive = async (taskId: string, selectionRequestId: number) => {
      if (selectTaskRequestId !== selectionRequestId || completedSelectTaskRequestId !== selectionRequestId) return;
      if (get().activeTask?.id === taskId) await get().selectTask(taskId);
    };

    return {
      session: signedOut,
      team: null,
      members: [],
      tasks: [],
      activeTask: null,
      notes: [],
      events: [],
      notifications: [],
      memberEvents: [],
      outboxFailures: [],
      syncState: idleSync,
      loading: true,
      error: null,
      view: 'all',
      memberFilter: null,

      async bootstrap() {
        if (!unsubscribeSync) {
          let lastSyncedAt = get().syncState.lastSyncedAt;
          unsubscribeSync = window.memex.team.onSyncState((syncState) => {
            set({ syncState });
            if (
              syncState.lastSyncedAt !== null
              && syncState.lastSyncedAt !== lastSyncedAt
              && get().session.teamId
              && !get().loading
            ) {
              lastSyncedAt = syncState.lastSyncedAt;
              void reload().catch(() => undefined);
              void refreshOutboxFailures().catch(() => undefined);
            }
          });
        }
        try {
          await bootstrapNow();
        } catch {
          // The store exposes bootstrap failures through `error`; initial callers stay mounted.
        }
      },

      async signIn(input) {
        apply(await run(() => window.memex.team.signIn(input)));
      },

      signUp(input) {
        return run(() => window.memex.team.signUp(input));
      },

      async signOut() {
        await run(() => window.memex.team.signOut());
        invalidateTaskRequests();
        set({
          session: signedOut,
          team: null,
          members: [],
          tasks: [],
          activeTask: null,
          notes: [],
          events: [],
          notifications: [],
          memberEvents: [],
          outboxFailures: [],
          syncState: idleSync,
          loading: false,
          error: null,
          view: 'all',
          memberFilter: null,
        });
      },

      async createTeam(input) {
        apply(await run(() => window.memex.team.createTeam(input)));
      },

      async joinTeam(input) {
        apply(await run(() => window.memex.team.joinTeam(input)));
      },

      async setView(view) {
        set({ view, memberFilter: view === 'mine' ? null : get().memberFilter });
        await reload();
      },

      async setMemberFilter(memberId) {
        set({ memberFilter: memberId });
        await reload();
      },

      async selectTask(id) {
        const requestId = ++selectTaskRequestId;
        const isCurrent = () => requestId === selectTaskRequestId;
        try {
          if (!id) {
            set({ activeTask: null, notes: [], events: [] });
            return;
          }
          const [task, notes, events] = await run(
            () =>
              Promise.all([
                window.memex.team.getTask(id),
                window.memex.team.getTaskNotes(id),
                window.memex.team.getTaskEvents(id),
              ]),
            isCurrent,
          );
          if (!isCurrent()) return;
          if (!task) {
            set({ activeTask: null, notes: [], events: [] });
            return;
          }
          set({ activeTask: task, notes, events });
        } catch (error) {
          if (isCurrent()) throw error;
        } finally {
          if (isCurrent()) completedSelectTaskRequestId = requestId;
        }
      },

      refresh: reload,

      async createTask(input) {
        const task = await run(() => window.memex.team.createTask(input));
        await reload();
        await get().selectTask(task.id);
        return task;
      },

      async updateTask(id, patch) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.updateTask(id, patch));
        await reload();
        await reselectTaskIfActive(id, selectionRequestId);
      },

      async startAssignee(taskId, version) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.startAssignee(taskId, version));
        await reload();
        await reselectTaskIfActive(taskId, selectionRequestId);
      },

      async addProgressNote(taskId, body) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.addProgressNote(taskId, body));
        await reselectTaskIfActive(taskId, selectionRequestId);
      },

      async submitAssignee(taskId, body, version) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.submitAssignee(taskId, body, version));
        await reload();
        await reselectTaskIfActive(taskId, selectionRequestId);
      },

      async reviewAssignee(taskId, assigneeId, decision, note, version) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.reviewAssignee(taskId, assigneeId, decision, note, version));
        await reload();
        await reselectTaskIfActive(taskId, selectionRequestId);
      },

      async reopenTask(taskId, version) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.reopenTask(taskId, version));
        await reload();
        await reselectTaskIfActive(taskId, selectionRequestId);
      },

      async archiveTask(taskId, version) {
        await run(() => window.memex.team.archiveTask(taskId, version));
        selectTaskRequestId += 1;
        set({ activeTask: null, notes: [], events: [] });
        await reload();
      },

      async closeAssignee(taskId, assigneeId, reason, version) {
        const selectionRequestId = selectTaskRequestId;
        await run(() => window.memex.team.closeAssignee(taskId, assigneeId, reason, version));
        await reload();
        await reselectTaskIfActive(taskId, selectionRequestId);
      },

      createInvite(input) {
        return run(() => window.memex.team.createInvite(input));
      },

      listInvites() {
        return run(() => window.memex.team.listInvites());
      },

      async revokeInvite(id) {
        await run(() => window.memex.team.revokeInvite(id));
      },

      async setMemberRole(patch) {
        await run(() => window.memex.team.setMemberRole(patch));
        await bootstrapNow();
      },

      async removeMember(userId) {
        await run(() => window.memex.team.removeMember(userId));
        await bootstrapNow();
      },

      async leaveTeam() {
        await run(() => window.memex.team.leaveTeam());
        await bootstrapNow();
      },

      async markNotificationRead(id) {
        const previous = get().notifications.find((item) => item.id === id);
        const readAt = previous?.readAt ?? Date.now();
        if (previous) {
          set((state) => ({
            notifications: state.notifications.map((item) =>
              item.id === id ? { ...item, readAt } : item,
            ),
          }));
        }
        try {
          await run(() => window.memex.team.markNotificationRead(id));
        } catch (error) {
          if (previous) {
            set((state) => ({
              notifications: state.notifications.map((item) =>
                item.id === id ? { ...item, readAt: previous.readAt } : item,
              ),
            }));
          }
          throw error;
        }
      },

      async retryOutbox(id) {
        await run(() => window.memex.team.retryOutbox(id));
        await run(refreshOutboxFailures);
        await reload();
      },

      async discardOutbox(id) {
        await run(() => window.memex.team.discardOutbox(id));
        await run(refreshOutboxFailures);
        await reload();
      },

      async syncNow() {
        let syncState: TeamSyncState;
        try {
          syncState = await run(() => window.memex.team.sync());
        } catch (error) {
          set({
            syncState: {
              ...get().syncState,
              phase: 'error',
              message: errorMessage(error),
            },
          });
          return;
        }
        set({ syncState });
        try {
          await Promise.all([reload(), run(refreshOutboxFailures)]);
        } catch {
          // reload already records the failure in `error`; keep the sync result intact.
        }
      },
    };
  });
}

export const useTeamStore = createTeamStore();
