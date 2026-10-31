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

export function createTeamStore(): UseBoundStore<StoreApi<TeamState>> {
  return create<TeamState>((set, get) => {
    const apply = (value: TeamBootstrap) =>
      set({
        session: value.session,
        team: value.team,
        members: value.members,
        tasks: value.tasks,
        notifications: value.notifications,
        syncState: value.sync,
        loading: false,
        error: null,
      });

    const run = async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        set({ error: null });
        return await action();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ error: message });
        throw error;
      }
    };

    const reload = async () => {
      const state = get();
      const [tasks, notifications] = await Promise.all([
        window.memex.team.listTasks({ view: state.view, memberId: state.memberFilter ?? undefined }),
        window.memex.team.listNotifications(),
      ]);
      const activeTask = state.activeTask
        ? tasks.find((task) => task.id === state.activeTask?.id) ?? null
        : null;
      set({ tasks, notifications, activeTask });
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
        set({ loading: true });
        try {
          apply(await run(() => window.memex.team.bootstrap()));
        } catch {
          set({ loading: false });
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
        set({
          session: signedOut,
          team: null,
          members: [],
          tasks: [],
          activeTask: null,
          notifications: [],
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
        await run(reload);
      },

      async setMemberFilter(memberId) {
        set({ memberFilter: memberId });
        await run(reload);
      },

      async selectTask(id) {
        if (!id) {
          set({ activeTask: null, notes: [], events: [] });
          return;
        }
        const [task, notes, events] = await run(() =>
          Promise.all([
            window.memex.team.getTask(id),
            window.memex.team.getTaskNotes(id),
            window.memex.team.getTaskEvents(id),
          ]),
        );
        set({ activeTask: task, notes, events });
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
        set({ activeTask: null });
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
        await get().bootstrap();
      },

      async removeMember(userId) {
        await run(() => window.memex.team.removeMember(userId));
        await get().bootstrap();
      },

      async markNotificationRead(id) {
        await run(() => window.memex.team.markNotificationRead(id));
        await reload();
      },

      async syncNow() {
        try {
          const syncState = await run(() => window.memex.team.sync());
          set({ syncState });
          await reload();
        } catch (value) {
          set({
            syncState: {
              ...get().syncState,
              phase: 'error',
              message: value instanceof Error ? value.message : String(value),
            },
          });
        }
      },
    };
  });
}

export const useTeamStore = createTeamStore();
