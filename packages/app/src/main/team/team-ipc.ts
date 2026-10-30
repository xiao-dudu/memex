import { ipcMain } from 'electron';
import {
  IPC,
  teamAssigneeActionSchema,
  teamCreateSchema,
  teamInviteCreateSchema,
  teamJoinSchema,
  teamReviewSchema,
  teamRolePatchSchema,
  teamSignInSchema,
  teamSignUpSchema,
  teamSubmitSchema,
  teamTaskCreateSchema,
  teamTaskFilterSchema,
  teamTaskUpdateSchema,
  type TeamSyncState,
} from '@memex/shared';
import type { TeamService } from './team-service.js';

function id(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('无效的 ID');
  return value;
}

function version(value: unknown): number {
  return teamAssigneeActionSchema.shape.expectedVersion.parse(value);
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 20_000) {
    throw new Error('无效的内容');
  }
  return value;
}

export function registerTeamIpc(service: TeamService, onSyncState: (state: TeamSyncState) => void): void {
  ipcMain.handle(IPC.teamBootstrap, () => service.bootstrap());
  ipcMain.handle(IPC.teamSignIn, (_event, input) => service.signIn(teamSignInSchema.parse(input)));
  ipcMain.handle(IPC.teamSignUp, (_event, input) => service.signUp(teamSignUpSchema.parse(input)));
  ipcMain.handle(IPC.teamSignOut, () => service.signOut());
  ipcMain.handle(IPC.teamCreateTeam, (_event, input) => service.createTeam(teamCreateSchema.parse(input)));
  ipcMain.handle(IPC.teamJoinTeam, (_event, input) => service.joinTeam(teamJoinSchema.parse(input)));
  ipcMain.handle(IPC.teamTasksList, (_event, filter) => service.listTasks(teamTaskFilterSchema.parse(filter)));
  ipcMain.handle(IPC.teamTasksGet, (_event, taskId) => service.getTask(id(taskId)));
  ipcMain.handle(IPC.teamNotificationsList, () => service.listNotifications());
  ipcMain.handle(IPC.teamTasksCreate, (_event, input) => service.createTask(teamTaskCreateSchema.parse(input)));
  ipcMain.handle(IPC.teamTasksUpdate, (_event, taskId, patch) =>
    service.updateTask(id(taskId), teamTaskUpdateSchema.parse(patch)));
  ipcMain.handle(IPC.teamStartAssignee, (_event, taskId, expectedVersion) => {
    const input = teamAssigneeActionSchema.parse({ taskId, expectedVersion });
    return service.startAssignee(input.taskId, input.expectedVersion);
  });
  ipcMain.handle(IPC.teamAddNote, (_event, taskId, body) =>
    service.addProgressNote(id(taskId), text(body)));
  ipcMain.handle(IPC.teamSubmitAssignee, (_event, taskId, body, expectedVersion) => {
    const input = teamSubmitSchema.parse({ taskId, expectedVersion, note: body });
    return service.submitAssignee(input.taskId, input.note, input.expectedVersion);
  });
  ipcMain.handle(IPC.teamReviewAssignee, (_event, taskId, assigneeId, decision, note, expectedVersion) => {
    const input = teamReviewSchema.parse({
      taskId,
      assigneeId,
      expectedVersion,
      decision,
      ...(note === null ? {} : { note }),
    });
    return service.reviewAssignee(
      input.taskId,
      input.assigneeId,
      input.decision,
      input.note ?? null,
      input.expectedVersion,
    );
  });
  ipcMain.handle(IPC.teamReopenTask, (_event, taskId, expectedVersion) =>
    service.reopenTask(id(taskId), version(expectedVersion)));
  ipcMain.handle(IPC.teamArchiveTask, (_event, taskId, expectedVersion) =>
    service.archiveTask(id(taskId), version(expectedVersion)));
  ipcMain.handle(IPC.teamCloseAssignee, (_event, taskId, assigneeId, reason, expectedVersion) =>
    service.closeAssignee(id(taskId), id(assigneeId), text(reason), version(expectedVersion)));
  ipcMain.handle(IPC.teamCreateInvite, (_event, input) =>
    service.createInvite(teamInviteCreateSchema.parse(input)));
  ipcMain.handle(IPC.teamRevokeInvite, (_event, inviteId) => service.revokeInvite(id(inviteId)));
  ipcMain.handle(IPC.teamSetMemberRole, (_event, patch) =>
    service.setMemberRole(teamRolePatchSchema.parse(patch)));
  ipcMain.handle(IPC.teamRemoveMember, (_event, userId) => service.removeMember(id(userId)));
  ipcMain.handle(IPC.teamMarkNotificationRead, (_event, notificationId) =>
    service.markNotificationRead(id(notificationId)));
  ipcMain.handle(IPC.teamTaskNotes, (_event, taskId) => service.getTaskNotes(id(taskId)));
  ipcMain.handle(IPC.teamTaskEvents, (_event, taskId) => service.getTaskEvents(id(taskId)));
  ipcMain.handle(IPC.teamSync, () => service.sync());
  service.onSyncState(onSyncState);
}
