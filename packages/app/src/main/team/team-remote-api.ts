import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TeamInvite,
  TeamMember,
  TeamMemberEvent,
  TeamNotification,
  TeamProgressNote,
  TeamTask,
  TeamTaskEvent,
} from '@memex/shared';
import type { TeamChangeSet, TeamRemoteApi } from './team-sync.js';

type Row = Record<string, any>;

const SNAPSHOT_TABLES = {
  members: { table: 'team_members', order: ['user_id'] },
  tasks: { table: 'team_tasks', order: ['id'] },
  leaders: { table: 'team_task_leaders', order: ['task_id', 'user_id'] },
  assignees: { table: 'team_task_assignees', order: ['task_id', 'user_id'] },
  notes: { table: 'team_task_progress_notes', order: ['id'] },
  events: { table: 'team_task_events', order: ['id'] },
  memberEvents: { table: 'team_member_events', order: ['id'] },
  notifications: { table: 'team_notifications', order: ['id'] },
} as const;

export function createTeamRemoteApi(supabase: SupabaseClient, pageSize = 1_000): TeamRemoteApi {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('INVALID_PAGE_SIZE');

  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
  };

  const fetchAll = async (
    table: string,
    order: readonly string[],
    teamId: string,
  ): Promise<Row[]> => {
    const rows: Row[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from(table).select('*').eq('team_id', teamId);
      for (const column of order) query = query.order(column, { ascending: true });
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Row[];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return rows;
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
    leaveTeam: (operationId, teamId) => rpc('team_leave_team', {
      p_operation_id: operationId,
      p_team_id: teamId,
    }),
    async listInvites(teamId) {
      const { data, error } = await supabase
        .from('team_invites')
        .select('*')
        .eq('team_id', teamId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map((row): TeamInvite => ({
        id: row.id,
        teamId: row.team_id,
        email: row.email,
        expiresAt: Number(row.expires_at),
        acceptedAt: row.accepted_at === null ? null : Number(row.accepted_at),
        revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
        createdAt: Number(row.created_at),
      }));
    },
    async pullChanges(teamId, cursor) {
      const [
        teamResult,
        membersRows,
        tasksRows,
        leadersRows,
        assigneesRows,
        notesRows,
        eventsRows,
        memberEventsRows,
        notificationsRows,
      ] = await Promise.all([
        supabase.from('teams').select('id, name').eq('id', teamId).single(),
        fetchAll(SNAPSHOT_TABLES.members.table, SNAPSHOT_TABLES.members.order, teamId),
        fetchAll(SNAPSHOT_TABLES.tasks.table, SNAPSHOT_TABLES.tasks.order, teamId),
        fetchAll(SNAPSHOT_TABLES.leaders.table, SNAPSHOT_TABLES.leaders.order, teamId),
        fetchAll(SNAPSHOT_TABLES.assignees.table, SNAPSHOT_TABLES.assignees.order, teamId),
        fetchAll(SNAPSHOT_TABLES.notes.table, SNAPSHOT_TABLES.notes.order, teamId),
        fetchAll(SNAPSHOT_TABLES.events.table, SNAPSHOT_TABLES.events.order, teamId),
        fetchAll(SNAPSHOT_TABLES.memberEvents.table, SNAPSHOT_TABLES.memberEvents.order, teamId),
        fetchAll(SNAPSHOT_TABLES.notifications.table, SNAPSHOT_TABLES.notifications.order, teamId),
      ]);
      if (teamResult.error) throw new Error(teamResult.error.message);

      const members: TeamMember[] = membersRows.map((row) => ({
        id: row.user_id,
        teamId: row.team_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        joinedAt: Number(row.joined_at),
        removedAt: row.removed_at === null ? null : Number(row.removed_at),
      }));
      const byId = new Map(members.map((member) => [member.id, member]));
      const notes: TeamProgressNote[] = notesRows
        .map((row) => ({
          id: row.id,
          taskId: row.task_id,
          userId: row.user_id,
          body: row.body,
          createdAt: Number(row.created_at),
        }))
        .sort((a, b) => a.createdAt - b.createdAt);
      const events: TeamTaskEvent[] = eventsRows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        actorId: row.actor_id,
        type: row.event_type,
        targetUserId: row.target_user_id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        createdAt: Number(row.created_at),
      }));
      const memberEvents: TeamMemberEvent[] = memberEventsRows.map((row) => ({
        id: row.id,
        teamId: row.team_id,
        actorId: row.actor_id,
        targetUserId: row.target_user_id,
        type: row.event_type,
        createdAt: Number(row.created_at),
      }));
      const tasks: TeamTask[] = tasksRows.map((row) => ({
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
        leaders: leadersRows
          .filter((item) => item.task_id === row.id)
          .map((item) => byId.get(item.user_id))
          .filter(Boolean) as TeamTask['leaders'],
        assignees: assigneesRows
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
      const notifications: TeamNotification[] = notificationsRows.map((row) => ({
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
        membersRows,
        tasksRows,
        leadersRows,
        assigneesRows,
        notesRows,
        eventsRows,
        memberEventsRows,
        notificationsRows,
      ]
        .flat()
        .map((row) => Number(row.sync_version ?? 0));
      return {
        team: teamResult.data ? { id: teamResult.data.id, name: teamResult.data.name } : null,
        members,
        tasks,
        notes,
        events,
        memberEvents,
        notifications,
        cursor: Math.max(cursor, ...versions),
        complete: true,
      } satisfies TeamChangeSet;
    },
  };
}
