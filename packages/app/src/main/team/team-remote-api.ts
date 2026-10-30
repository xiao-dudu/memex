import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamMember, TeamNotification, TeamProgressNote, TeamTask, TeamTaskEvent } from '@memex/shared';
import type { TeamChangeSet, TeamRemoteApi } from './team-sync.js';

export function createTeamRemoteApi(supabase: SupabaseClient): TeamRemoteApi {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
  };

  return {
    async createTask(operationId, task) {
      await rpc('team_create_task', {
        p_operation_id: operationId,
        p_task_id: task.id,
        p_team_id: task.teamId,
        p_title: task.title,
        p_description: task.description,
        p_description_json: task.descriptionJson,
        p_priority: task.priority,
        p_due_at: task.dueAt,
        p_tags: task.tags,
        p_assignee_ids: task.assignees.map((item) => item.id),
        p_leader_ids: task.leaders.map((item) => item.id),
      });
    },
    async updateTask(operationId, task, expectedVersion) {
      await rpc('team_update_task', {
        p_operation_id: operationId,
        p_task_id: task.id,
        p_expected_version: expectedVersion,
        p_title: task.title,
        p_description: task.description,
        p_description_json: task.descriptionJson,
        p_priority: task.priority,
        p_due_at: task.dueAt,
        p_tags: task.tags,
        p_assignee_ids: task.assignees.map((item) => item.id),
        p_leader_ids: task.leaders.map((item) => item.id),
      });
    },
    startAssignee: (operationId, taskId, expectedVersion) => rpc('team_start_assignee', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_expected_version: expectedVersion,
    }),
    addProgressNote: (operationId, taskId, noteId, body) => rpc('team_add_progress_note', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_note_id: noteId,
      p_body: body,
    }),
    submitAssignee: (operationId, taskId, noteId, body, expectedVersion) => rpc('team_submit_assignee', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_note_id: noteId,
      p_note: body,
      p_expected_version: expectedVersion,
    }),
    reviewAssignee: (operationId, taskId, assigneeId, decision, note, expectedVersion) => rpc('team_review_assignee', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_assignee_id: assigneeId,
      p_decision: decision,
      p_note: note,
      p_expected_version: expectedVersion,
    }),
    reopenTask: (operationId, taskId, expectedVersion) => rpc('team_reopen_task', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_expected_version: expectedVersion,
    }),
    archiveTask: (operationId, taskId, expectedVersion) => rpc('team_archive_task', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_expected_version: expectedVersion,
    }),
    closeAssignee: (operationId, taskId, assigneeId, reason, expectedVersion) => rpc('team_close_assignee', {
      p_operation_id: operationId,
      p_task_id: taskId,
      p_assignee_id: assigneeId,
      p_reason: reason,
      p_expected_version: expectedVersion,
    }),
    markNotificationRead: (operationId, notificationId) => rpc('team_mark_notification_read', {
      p_operation_id: operationId,
      p_notification_id: notificationId,
    }),
    createTeam: (operationId, teamId, name, displayName) => rpc('team_create_team', {
      p_operation_id: operationId,
      p_team_id: teamId,
      p_name: name,
      p_display_name: displayName,
    }),
    async createInvite(operationId, teamId, email, expiresAt) {
      const { data, error } = await supabase.rpc('team_create_invite', {
        p_operation_id: operationId,
        p_team_id: teamId,
        p_email: email,
        p_expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);
      return String(data);
    },
    acceptInvite: (operationId, token, displayName) => rpc('team_accept_invite', {
      p_operation_id: operationId,
      p_token: token,
      p_display_name: displayName,
    }),
    revokeInvite: (operationId, inviteId) => rpc('team_revoke_invite', {
      p_operation_id: operationId,
      p_invite_id: inviteId,
    }),
    setMemberRole: (operationId, teamId, userId, role) => rpc('team_set_member_role', {
      p_operation_id: operationId,
      p_team_id: teamId,
      p_user_id: userId,
      p_role: role,
    }),
    removeMember: (operationId, teamId, userId) => rpc('team_remove_member', {
      p_operation_id: operationId,
      p_team_id: teamId,
      p_user_id: userId,
    }),
    async pullChanges(teamId, cursor) {
      const [
        teamResult,
        membersResult,
        tasksResult,
        leadersResult,
        assigneesResult,
        notesResult,
        eventsResult,
        notificationsResult,
      ] = await Promise.all([
        supabase.from('teams').select('id, name').eq('id', teamId).single(),
        supabase.from('team_members').select('*').eq('team_id', teamId),
        supabase.from('team_tasks').select('*').eq('team_id', teamId),
        supabase.from('team_task_leaders').select('*').eq('team_id', teamId),
        supabase.from('team_task_assignees').select('*').eq('team_id', teamId),
        supabase.from('team_task_progress_notes').select('*').eq('team_id', teamId),
        supabase.from('team_task_events').select('*').eq('team_id', teamId),
        supabase.from('team_notifications').select('*').eq('team_id', teamId),
      ]);
      for (const result of [
        teamResult,
        membersResult,
        tasksResult,
        leadersResult,
        assigneesResult,
        notesResult,
        eventsResult,
        notificationsResult,
      ]) {
        if (result.error) throw new Error(result.error.message);
      }

      const members: TeamMember[] = (membersResult.data ?? []).map((row) => ({
        id: row.user_id,
        teamId: row.team_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        joinedAt: Number(row.joined_at),
        removedAt: row.removed_at === null ? null : Number(row.removed_at),
      }));
      const byId = new Map(members.map((member) => [member.id, member]));
      const notes: TeamProgressNote[] = (notesResult.data ?? [])
        .map((row) => ({
          id: row.id,
          taskId: row.task_id,
          userId: row.user_id,
          body: row.body,
          createdAt: Number(row.created_at),
        }))
        .sort((a, b) => a.createdAt - b.createdAt);
      const events: TeamTaskEvent[] = (eventsResult.data ?? []).map((row) => ({
        id: row.id,
        taskId: row.task_id,
        actorId: row.actor_id,
        type: row.event_type,
        targetUserId: row.target_user_id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        createdAt: Number(row.created_at),
      }));
      const tasks: TeamTask[] = (tasksResult.data ?? []).map((row) => ({
        id: row.id,
        teamId: row.team_id,
        title: row.title,
        description: row.description,
        descriptionJson: row.description_json,
        priority: row.priority,
        dueAt: row.due_at === null ? null : Number(row.due_at),
        tags: row.tags ?? [],
        createdBy: row.created_by,
        archivedAt: row.archived_at === null ? null : Number(row.archived_at),
        version: row.version,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        leaders: (leadersResult.data ?? [])
          .filter((item) => item.task_id === row.id)
          .map((item) => byId.get(item.user_id))
          .filter(Boolean) as TeamTask['leaders'],
        assignees: (assigneesResult.data ?? [])
          .filter((item) => item.task_id === row.id)
          .map((item) => {
            const member = byId.get(item.user_id);
            const latest = notes.filter((note) => note.taskId === row.id && note.userId === item.user_id).at(-1);
            return {
              id: item.user_id,
              email: member?.email ?? '',
              displayName: member?.displayName ?? '',
              status: item.status,
              latestNote: latest?.body ?? null,
              approvedBy: item.approved_by,
              approvedAt: item.approved_at === null ? null : Number(item.approved_at),
              version: item.version,
            };
          }),
      }));
      const notifications: TeamNotification[] = (notificationsResult.data ?? []).map((row) => ({
        id: row.id,
        teamId: row.team_id,
        userId: row.user_id,
        type: row.type,
        taskId: row.task_id,
        title: row.title,
        body: row.body,
        readAt: row.read_at === null ? null : Number(row.read_at),
        createdAt: Number(row.created_at),
      }));
      const versions = [
        membersResult.data,
        tasksResult.data,
        leadersResult.data,
        assigneesResult.data,
        notesResult.data,
        eventsResult.data,
        notificationsResult.data,
      ]
        .flatMap((rows) => rows ?? [])
        .map((row) => Number(row.sync_version ?? 0));
      return {
        team: teamResult.data ? { id: teamResult.data.id, name: teamResult.data.name } : null,
        members,
        tasks,
        notes,
        events,
        notifications,
        cursor: Math.max(cursor, ...versions),
      } satisfies TeamChangeSet;
    },
  };
}
