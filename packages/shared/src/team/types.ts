export type TeamRole = 'leader' | 'member';
export type TeamPriority = 'low' | 'medium' | 'high';
export type TeamAssigneeStatus = 'todo' | 'doing' | 'submitted' | 'approved' | 'closed';
export type TeamTaskState = 'in_progress' | 'completed' | 'ended_with_closed' | 'archived';
export type TeamTaskView = 'all' | 'mine' | 'pending_review' | 'overdue' | 'archived';
export type TeamNotificationType =
  | 'assigned'
  | 'returned'
  | 'approved'
  | 'task_completed'
  | 'due_soon'
  | 'overdue';

export interface TeamUser {
  id: string;
  email: string;
  displayName: string;
}

export interface TeamMember extends TeamUser {
  teamId: string;
  role: TeamRole;
  joinedAt: number;
  removedAt: number | null;
}

export interface TeamTaskAssignee extends TeamUser {
  status: TeamAssigneeStatus;
  latestNote: string | null;
  approvedBy: string | null;
  approvedAt: number | null;
  version: number;
}

export interface TeamProgressNote {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  createdAt: number;
}

export interface TeamTaskEvent {
  id: string;
  taskId: string;
  actorId: string;
  type: 'created' | 'assigned' | 'started' | 'submitted' | 'returned' | 'approved' | 'reopened' | 'archived' | 'closed';
  targetUserId: string | null;
  fromStatus: TeamAssigneeStatus | null;
  toStatus: TeamAssigneeStatus | null;
  createdAt: number;
}

export interface TeamTask {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  descriptionJson: string | null;
  priority: TeamPriority;
  dueAt: number | null;
  tags: string[];
  createdBy: string;
  archivedAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  leaders: TeamUser[];
  assignees: TeamTaskAssignee[];
}

export interface TeamTaskInput {
  title: string;
  description?: string | null;
  descriptionJson?: string | null;
  priority?: TeamPriority;
  dueAt?: number | null;
  tags?: string[];
  assigneeIds: string[];
  leaderIds: string[];
}

export interface TeamTaskPatch extends Partial<Omit<TeamTaskInput, 'assigneeIds' | 'leaderIds'>> {
  expectedVersion: number;
  assigneeIds?: string[];
  leaderIds?: string[];
}

export interface TeamTaskFilter {
  view?: TeamTaskView;
  memberId?: string;
  status?: TeamAssigneeStatus;
  tag?: string;
  query?: string;
}

export interface TeamNotification {
  id: string;
  teamId: string;
  userId: string;
  type: TeamNotificationType;
  taskId: string | null;
  title: string;
  body: string;
  readAt: number | null;
  createdAt: number;
}

export interface TeamMemberEvent {
  id: string;
  teamId: string;
  actorId: string;
  targetUserId: string;
  type: 'removed' | 'left';
  createdAt: number;
}

export interface TeamOutboxFailure {
  id: string;
  type: string;
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  email: string;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export interface TeamSessionInfo {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  teamId: string | null;
  role: TeamRole | null;
}

export type TeamSyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface TeamSyncState {
  phase: TeamSyncPhase;
  pendingCount: number;
  lastSyncedAt: number | null;
  message: string | null;
}

export interface TeamBootstrap {
  session: TeamSessionInfo;
  team: { id: string; name: string } | null;
  members: TeamMember[];
  tasks: TeamTask[];
  notifications: TeamNotification[];
  memberEvents: TeamMemberEvent[];
  outboxFailures: TeamOutboxFailure[];
  sync: TeamSyncState;
}

export interface TeamSignInInput { email: string; password: string; }
export interface TeamSignUpInput extends TeamSignInInput { displayName: string; }
export interface TeamCreateInput { name: string; }
export interface TeamJoinInput { token: string; }
export interface TeamInviteCreateInput { email: string; expiresInHours: number; }
export interface TeamRolePatch { userId: string; role: TeamRole; }
