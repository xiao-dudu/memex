import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type {
  TeamBootstrap,
  TeamCreateInput,
  TeamInviteCreateInput,
  TeamJoinInput,
  TeamMember,
  TeamNotification,
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
  revokeInvite(inviteId: string): Promise<void>;
  setMemberRole(patch: TeamRolePatch): Promise<void>;
  removeMember(userId: string): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
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

    const invalidateTaskRequests = () => {
      reloadRequestId += 1;
      selectTaskRequestId += 1;
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
      set({
        session: value.session,
        team: value.team,
        members: value.members,
        tasks: value.tasks,
        notifications: value.notifications,
        syncState: value.sync,
        loading: false,
        error: null,
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
    const reload = async () => {
      const requestId = ++reloadRequestId;
      const isCurrent = () => requestId === reloadRequestId;
      const state = get();
      try {
        await run(async () => {
          const [tasks, notifications] = await Promise.all([
            window.memex.team.listTasks({ view: state.view, memberId: state.memberFilter ?? undefined }),
            window.memex.team.listNotifications(),
          ]);
          if (!isCurrent()) return;
          const currentActiveTaskId = get().activeTask?.id ?? null;
          const activeTask = currentActiveTaskId
            ? tasks.find((task) => task.id === currentActiveTaskId) ?? null
            : null;
          set({
            tasks,
            notifications,
            activeTask,
            ...(activeTask ? {} : { notes: [], events: [] }),
          });
        }, isCurrent);
      } catch (error) {
        if (isCurrent()) throw error;
      }
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
      syncState: idleSync,
      loading: true,
      error: null,
      view: 'all',
      memberFilter: null,

      async bootstrap() {
        if (!unsubscribeSync) {
          unsubscribeSync = window.memex.team.onSyncState((syncState) => set({ syncState }));
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
        if (!id) {
          set({ activeTask: null, notes: [], events: [] });
          return;
        }
        try {
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
        await run(() => window.memex.team.updateTask(id, patch));
        await reload();
        await get().selectTask(id);
      },

      async startAssignee(taskId, version) {
        await run(() => window.memex.team.startAssignee(taskId, version));
        await reload();
        await get().selectTask(taskId);
      },

      async addProgressNote(taskId, body) {
        await run(() => window.memex.team.addProgressNote(taskId, body));
        await get().selectTask(taskId);
      },

      async submitAssignee(taskId, body, version) {
        await run(() => window.memex.team.submitAssignee(taskId, body, version));
        await reload();
        await get().selectTask(taskId);
      },

      async reviewAssignee(taskId, assigneeId, decision, note, version) {
        await run(() => window.memex.team.reviewAssignee(taskId, assigneeId, decision, note, version));
        await reload();
        await get().selectTask(taskId);
      },

      async reopenTask(taskId, version) {
        await run(() => window.memex.team.reopenTask(taskId, version));
        await reload();
        await get().selectTask(taskId);
      },

      async archiveTask(taskId, version) {
        await run(() => window.memex.team.archiveTask(taskId, version));
        selectTaskRequestId += 1;
        set({ activeTask: null, notes: [], events: [] });
        await reload();
      },

      async closeAssignee(taskId, assigneeId, reason, version) {
        await run(() => window.memex.team.closeAssignee(taskId, assigneeId, reason, version));
        await reload();
        await get().selectTask(taskId);
      },

      createInvite(input) {
        return run(() => window.memex.team.createInvite(input));
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
          await reload();
        } catch {
          // reload already records the failure in `error`; keep the sync result intact.
        }
      },
    };
  });
}

export const useTeamStore = createTeamStore();
