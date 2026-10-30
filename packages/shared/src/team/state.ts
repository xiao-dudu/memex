import type { TeamRole, TeamTask, TeamTaskState } from './types.js';

export function deriveTeamTaskState(task: TeamTask): TeamTaskState {
  if (task.archivedAt !== null) return 'archived';
  const active = task.assignees;
  if (active.length === 0) return 'in_progress';
  if (active.every((item) => item.status === 'approved')) return 'completed';
  if (active.some((item) => item.status === 'closed') && active.every((item) => item.status === 'approved' || item.status === 'closed')) {
    return 'ended_with_closed';
  }
  return 'in_progress';
}

export function hasNonAssigneeApprover(assigneeIds: string[], leaderIds: string[], creatorId: string): boolean {
  const assignees = new Set(assigneeIds);
  return [...new Set([creatorId, ...leaderIds])].some((id) => !assignees.has(id));
}

export function canApproveAssignee(task: TeamTask, actorId: string, activeLeaderIds: string[]): boolean {
  const assignee = task.assignees.find((item) => item.id === actorId);
  if (assignee) return false;
  const active = new Set(activeLeaderIds);
  if (!active.has(actorId)) return false;
  return task.createdBy === actorId || task.leaders.some((leader) => leader.id === actorId);
}

export function canSeeTeamTask(task: TeamTask, userId: string, role: TeamRole): boolean {
  if (role === 'leader') return true;
  return task.assignees.some((assignee) => assignee.id === userId);
}
