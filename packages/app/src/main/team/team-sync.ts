import type {
  TeamMember,
  TeamNotification,
  TeamProgressNote,
  TeamSyncState,
  TeamTask,
  TeamTaskEvent,
} from '@memex/shared';
import type { TeamCache } from './team-cache.js';

export interface TeamChangeSet {
  team: { id: string; name: string } | null;
  members: TeamMember[];
  tasks: TeamTask[];
  notes: TeamProgressNote[];
  events: TeamTaskEvent[];
  notifications: TeamNotification[];
  cursor: number;
}

export interface TeamRemoteApi {
  createTask(operationId: string, task: TeamTask): Promise<void>;
  updateTask(operationId: string, task: TeamTask, expectedVersion: number): Promise<void>;
  startAssignee(operationId: string, taskId: string, expectedVersion: number): Promise<void>;
  addProgressNote(operationId: string, taskId: string, body: string): Promise<void>;
  submitAssignee(operationId: string, taskId: string, body: string, expectedVersion: number): Promise<void>;
  reviewAssignee(
    operationId: string,
    taskId: string,
    assigneeId: string,
    decision: 'approve' | 'return',
    note: string | null,
    expectedVersion: number,
  ): Promise<void>;
  reopenTask(operationId: string, taskId: string, expectedVersion: number): Promise<void>;
  archiveTask(operationId: string, taskId: string, expectedVersion: number): Promise<void>;
  closeAssignee(
    operationId: string,
    taskId: string,
    assigneeId: string,
    reason: string,
    expectedVersion: number,
  ): Promise<void>;
  markNotificationRead(operationId: string, notificationId: string): Promise<void>;
  createTeam(operationId: string, teamId: string, name: string, displayName: string): Promise<void>;
  createInvite(operationId: string, teamId: string, email: string, expiresAt: number): Promise<string>;
  acceptInvite(operationId: string, token: string, displayName: string): Promise<void>;
  revokeInvite(operationId: string, inviteId: string): Promise<void>;
  setMemberRole(operationId: string, teamId: string, userId: string, role: 'leader' | 'member'): Promise<void>;
  removeMember(operationId: string, teamId: string, userId: string): Promise<void>;
  pullChanges(teamId: string, cursor: number): Promise<TeamChangeSet>;
}

export interface TeamSync {
  syncNow(teamId: string): Promise<TeamSyncState>;
}

interface SyncOptions {
  api: TeamRemoteApi;
  cache: TeamCache;
  isOnline: () => boolean;
  now: () => number;
}

type OutboxPayload = {
  task?: TeamTask;
  taskId?: string;
  expectedVersion?: number;
  body?: string;
  assigneeId?: string;
  decision?: 'approve' | 'return';
  note?: string | null;
  reason?: string;
  notificationId?: string;
  teamId?: string;
  teamName?: string;
  displayName?: string;
  email?: string;
  expiresAt?: number;
  token?: string;
  inviteId?: string;
  userId?: string;
  role?: 'leader' | 'member';
};

export function createTeamSync({ api, cache, isOnline, now }: SyncOptions): TeamSync {
  const dispatch = async (id: string, type: string, payload: OutboxPayload): Promise<void> => {
    switch (type) {
      case 'create_task':
        return api.createTask(id, payload.task!);
      case 'update_task':
        return api.updateTask(id, payload.task!, payload.expectedVersion!);
      case 'start_assignee':
        return api.startAssignee(id, payload.taskId!, payload.expectedVersion!);
      case 'add_progress_note':
        return api.addProgressNote(id, payload.taskId!, payload.body!);
      case 'submit_assignee':
        return api.submitAssignee(id, payload.taskId!, payload.body!, payload.expectedVersion!);
      case 'review_assignee':
        return api.reviewAssignee(
          id,
          payload.taskId!,
          payload.assigneeId!,
          payload.decision!,
          payload.note ?? null,
          payload.expectedVersion!,
        );
      case 'reopen_task':
        return api.reopenTask(id, payload.taskId!, payload.expectedVersion!);
      case 'archive_task':
        return api.archiveTask(id, payload.taskId!, payload.expectedVersion!);
      case 'close_assignee':
        return api.closeAssignee(
          id,
          payload.taskId!,
          payload.assigneeId!,
          payload.reason ?? '',
          payload.expectedVersion!,
        );
      case 'mark_notification_read':
        return api.markNotificationRead(id, payload.notificationId!);
      case 'create_team':
        return api.createTeam(id, payload.teamId!, payload.teamName!, payload.displayName!);
      case 'create_invite':
        await api.createInvite(id, payload.teamId!, payload.email!, payload.expiresAt!);
        return;
      case 'accept_invite':
        return api.acceptInvite(id, payload.token!, payload.displayName!);
      case 'revoke_invite':
        return api.revokeInvite(id, payload.inviteId!);
      case 'set_member_role':
        return api.setMemberRole(id, payload.teamId!, payload.userId!, payload.role!);
      case 'remove_member':
        return api.removeMember(id, payload.teamId!, payload.userId!);
      default:
        throw new Error(`UNKNOWN_OPERATION:${type}`);
    }
  };

  return {
    async syncNow(teamId) {
      if (!isOnline()) {
        return { phase: 'offline', pendingCount: cache.countOutbox(), lastSyncedAt: null, message: '等待联网' };
      }

      try {
        for (const row of cache.listPending()) {
          try {
            await dispatch(row.id, row.type, JSON.parse(row.payloadJson) as OutboxPayload);
            cache.markPending(row.id, 'done', null);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            cache.markPending(row.id, 'failed', message);
            return { phase: 'error', pendingCount: cache.countOutbox(), lastSyncedAt: null, message };
          }
        }

        const cursor = Number(cache.getMeta('cursor') ?? '0');
        const changes = await api.pullChanges(teamId, cursor);
        cache.replaceMembers(changes.members);
        if (changes.team) cache.setTeam(changes.team);
        for (const note of changes.notes) cache.appendNote(note);
        for (const event of changes.events) cache.appendEvent(event);
        for (const task of changes.tasks) cache.upsertTask(task);
        for (const notification of changes.notifications) cache.upsertNotification(notification);
        cache.setMeta('cursor', String(changes.cursor));
        cache.setMeta('lastSyncedAt', String(now()));
        return { phase: 'idle', pendingCount: cache.countOutbox(), lastSyncedAt: now(), message: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { phase: 'error', pendingCount: cache.countOutbox(), lastSyncedAt: null, message };
      }
    },
  };
}