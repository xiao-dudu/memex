import { rmSync } from 'node:fs';
import {
  canSeeTeamTask,
  deriveTeamTaskState,
  openDatabase,
  type MemexDatabase,
  type TeamMember,
  type TeamNotification,
  type TeamProgressNote,
  type TeamRole,
  type TeamTask,
  type TeamTaskEvent,
  type TeamTaskFilter,
} from '@memex/shared';
import type { TeamChangeSet } from './team-sync.js';

export type OutboxStatus = 'pending' | 'done' | 'failed';

export interface OutboxRow {
  id: string;
  type: string;
  payloadJson: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS team_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS team_info (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL, joined_at INTEGER NOT NULL, removed_at INTEGER
);
CREATE TABLE IF NOT EXISTS team_tasks (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, description_json TEXT,
  priority TEXT NOT NULL, due_at INTEGER, tags_json TEXT NOT NULL, created_by TEXT NOT NULL,
  archived_at INTEGER, version INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_task_leaders (
  task_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE TABLE IF NOT EXISTS team_task_assignees (
  task_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL,
  status TEXT NOT NULL, latest_note TEXT, approved_by TEXT, approved_at INTEGER,
  version INTEGER NOT NULL, PRIMARY KEY (task_id, user_id)
);
CREATE TABLE IF NOT EXISTS team_notes (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, actor_id TEXT NOT NULL, type TEXT NOT NULL,
  target_user_id TEXT, from_status TEXT, to_status TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_notifications (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL,
  task_id TEXT, title TEXT NOT NULL, body TEXT NOT NULL, read_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_outbox (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS team_outbox_status ON team_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS team_notes_task ON team_notes(task_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS team_events_task ON team_events(task_id, created_at);
`;

export interface TeamCache {
  setMeta(key: string, value: string): void;
  getMeta(key: string): string | null;
  replaceMembers(members: TeamMember[]): void;
  setTeam(team: { id: string; name: string }): void;
  getTeam(): { id: string; name: string } | null;
  listMembers(): TeamMember[];
  upsertTask(task: TeamTask): void;
  getTask(id: string): TeamTask | null;
  listTasks(filter: TeamTaskFilter, userId: string, role: TeamRole, now: number): TeamTask[];
  appendNote(note: TeamProgressNote): void;
  listNotes(taskId: string): TeamProgressNote[];
  appendEvent(event: TeamTaskEvent): void;
  listEvents(taskId: string): TeamTaskEvent[];
  upsertNotification(notification: TeamNotification): void;
  listNotifications(userId: string): TeamNotification[];
  enqueue(type: string, payload: unknown, id: string, createdAt: number): void;
  listPending(): OutboxRow[];
  countOutbox(): number;
  mergeChanges(changes: TeamChangeSet, cursor: number): void;
  markPending(id: string, status: OutboxStatus, lastError: string | null): void;
  clear(): void;
  close(): void;
}

export function openTeamCache(path: string): TeamCache {
  const db = openDatabase(path);
  db.exec(SCHEMA);
  return createTeamCache(db);
}

export function clearTeamCache(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

function createTeamCache(db: MemexDatabase): TeamCache {
  const readTask = (id: string): TeamTask | null => {
    const row = db.prepare('SELECT * FROM team_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const leaders = (db.prepare(`
      SELECT user_id AS id, email, display_name AS displayName
      FROM team_task_leaders WHERE task_id = ? ORDER BY rowid
    `).all(id) as Record<string, unknown>[]).map((leader) => ({
      id: String(leader.id),
      email: String(leader.email),
      displayName: String(leader.displayName),
    }));

    const assignees = (db.prepare(`
      SELECT a.user_id AS id, a.email, a.display_name AS displayName, a.status,
        coalesce(
          (SELECT n.body FROM team_notes n
            WHERE n.task_id = a.task_id AND n.user_id = a.user_id
            ORDER BY n.created_at DESC, n.id DESC LIMIT 1),
          a.latest_note
        ) AS latestNote,
        a.approved_by AS approvedBy, a.approved_at AS approvedAt, a.version
      FROM team_task_assignees a WHERE a.task_id = ? ORDER BY a.rowid
    `).all(id) as Record<string, unknown>[]).map((assignee) => ({
      id: String(assignee.id),
      email: String(assignee.email),
      displayName: String(assignee.displayName),
      status: assignee.status as TeamTask['assignees'][number]['status'],
      latestNote: assignee.latestNote === null ? null : String(assignee.latestNote),
      approvedBy: assignee.approvedBy === null ? null : String(assignee.approvedBy),
      approvedAt: assignee.approvedAt === null ? null : Number(assignee.approvedAt),
      version: Number(assignee.version),
    }));

    return {
      id: String(row.id),
      teamId: String(row.team_id),
      title: String(row.title),
      description: row.description === null ? null : String(row.description),
      descriptionJson: row.description_json === null ? null : String(row.description_json),
      priority: row.priority as TeamTask['priority'],
      dueAt: row.due_at === null ? null : Number(row.due_at),
      tags: JSON.parse(String(row.tags_json)) as string[],
      createdBy: String(row.created_by),
      archivedAt: row.archived_at === null ? null : Number(row.archived_at),
      version: Number(row.version),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      leaders,
      assignees,
    };
  };

  const cache: TeamCache = {
    setMeta(key, value) {
      db.prepare('INSERT INTO team_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, value);
    },

    getMeta(key) {
      const row = db.prepare('SELECT value FROM team_meta WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    replaceMembers(members) {
      const apply = db.transaction(() => {
        db.prepare('DELETE FROM team_members').run();
        for (const member of members) {
          db.prepare(`
            INSERT INTO team_members(user_id, team_id, email, display_name, role, joined_at, removed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(member.id, member.teamId, member.email, member.displayName, member.role, member.joinedAt, member.removedAt);
        }
      });
      apply();
    },

    setTeam(team) {
      db.prepare('INSERT INTO team_info(id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name')
        .run(team.id, team.name);
    },

    getTeam() {
      const row = db.prepare('SELECT id, name FROM team_info LIMIT 1').get() as { id: string; name: string } | undefined;
      return row ?? null;
    },

    listMembers() {
      return (db.prepare('SELECT * FROM team_members ORDER BY role, display_name').all() as Record<string, unknown>[]).map((row) => ({
        id: String(row.user_id),
        teamId: String(row.team_id),
        email: String(row.email),
        displayName: String(row.display_name),
        role: row.role as TeamMember['role'],
        joinedAt: Number(row.joined_at),
        removedAt: row.removed_at === null ? null : Number(row.removed_at),
      }));
    },

    upsertTask(task) {
      const apply = db.transaction(() => {
        db.prepare(`
          INSERT INTO team_tasks(
            id, team_id, title, description, description_json, priority, due_at, tags_json,
            created_by, archived_at, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            team_id = excluded.team_id,
            title = excluded.title,
            description = excluded.description,
            description_json = excluded.description_json,
            priority = excluded.priority,
            due_at = excluded.due_at,
            tags_json = excluded.tags_json,
            created_by = excluded.created_by,
            archived_at = excluded.archived_at,
            version = excluded.version,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `).run(
          task.id,
          task.teamId,
          task.title,
          task.description,
          task.descriptionJson,
          task.priority,
          task.dueAt,
          JSON.stringify(task.tags),
          task.createdBy,
          task.archivedAt,
          task.version,
          task.createdAt,
          task.updatedAt,
        );

        db.prepare('DELETE FROM team_task_leaders WHERE task_id = ?').run(task.id);
        db.prepare('DELETE FROM team_task_assignees WHERE task_id = ?').run(task.id);

        for (const leader of task.leaders) {
          db.prepare(`
            INSERT INTO team_task_leaders(task_id, user_id, email, display_name) VALUES (?, ?, ?, ?)
          `).run(task.id, leader.id, leader.email, leader.displayName);
        }

        for (const assignee of task.assignees) {
          db.prepare(`
            INSERT INTO team_task_assignees(
              task_id, user_id, email, display_name, status, latest_note, approved_by, approved_at, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            task.id,
            assignee.id,
            assignee.email,
            assignee.displayName,
            assignee.status,
            assignee.latestNote,
            assignee.approvedBy,
            assignee.approvedAt,
            assignee.version,
          );
        }
      });
      apply();
    },

    getTask: readTask,

    listTasks(filter, userId, role, now) {
      const ids = (db.prepare('SELECT id FROM team_tasks ORDER BY due_at IS NULL, due_at, created_at DESC').all() as { id: string }[])
        .map((row) => row.id);

      return ids
        .map(readTask)
        .filter((task): task is TeamTask => task !== null)
        .filter((task) => canSeeTeamTask(task, userId, role))
        .filter((task) => filter.view === 'archived' ? task.archivedAt !== null : task.archivedAt === null)
        .filter((task) => filter.view !== 'mine' || task.assignees.some((item) => item.id === userId))
        .filter((task) => filter.view !== 'pending_review' || (role === 'leader' && task.assignees.some((item) => item.status === 'submitted')))
        .filter((task) => filter.view !== 'overdue' || (task.dueAt !== null && task.dueAt < now && deriveTeamTaskState(task) === 'in_progress'))
        .filter((task) => !filter.memberId || task.assignees.some((item) => item.id === filter.memberId))
        .filter((task) => !filter.status || task.assignees.some((item) => item.status === filter.status))
        .filter((task) => !filter.tag || task.tags.includes(filter.tag))
        .filter((task) => !filter.query || `${task.title}\n${task.description ?? ''}\n${task.tags.join(' ')}`.includes(filter.query));
    },

    appendNote(note) {
      db.prepare(`
        INSERT INTO team_notes(id, task_id, user_id, body, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(note.id, note.taskId, note.userId, note.body, note.createdAt);
    },

    listNotes(taskId) {
      return (db.prepare('SELECT * FROM team_notes WHERE task_id = ? ORDER BY created_at, id').all(taskId) as Record<string, unknown>[])
        .map((row) => ({
          id: String(row.id),
          taskId: String(row.task_id),
          userId: String(row.user_id),
          body: String(row.body),
          createdAt: Number(row.created_at),
        }));
    },

    appendEvent(event) {
      db.prepare(`
        INSERT INTO team_events(id, task_id, actor_id, type, target_user_id, from_status, to_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(
        event.id,
        event.taskId,
        event.actorId,
        event.type,
        event.targetUserId,
        event.fromStatus,
        event.toStatus,
        event.createdAt,
      );
    },

    listEvents(taskId) {
      return (db.prepare('SELECT * FROM team_events WHERE task_id = ? ORDER BY created_at, id').all(taskId) as Record<string, unknown>[])
        .map((row) => ({
          id: String(row.id),
          taskId: String(row.task_id),
          actorId: String(row.actor_id),
          type: row.type as TeamTaskEvent['type'],
          targetUserId: row.target_user_id === null ? null : String(row.target_user_id),
          fromStatus: row.from_status as TeamTaskEvent['fromStatus'],
          toStatus: row.to_status as TeamTaskEvent['toStatus'],
          createdAt: Number(row.created_at),
        }));
    },

    upsertNotification(notification) {
      db.prepare(`
        INSERT INTO team_notifications(id, team_id, user_id, type, task_id, title, body, read_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET read_at = excluded.read_at
      `).run(
        notification.id,
        notification.teamId,
        notification.userId,
        notification.type,
        notification.taskId,
        notification.title,
        notification.body,
        notification.readAt,
        notification.createdAt,
      );
    },

    listNotifications(userId) {
      return (db.prepare('SELECT * FROM team_notifications WHERE user_id = ? ORDER BY created_at DESC, id')
        .all(userId) as Record<string, unknown>[])
        .map((row) => ({
          id: String(row.id),
          teamId: String(row.team_id),
          userId: String(row.user_id),
          type: row.type as TeamNotification['type'],
          taskId: row.task_id === null ? null : String(row.task_id),
          title: String(row.title),
          body: String(row.body),
          readAt: row.read_at === null ? null : Number(row.read_at),
          createdAt: Number(row.created_at),
        }));
    },

    enqueue(type, payload, id, createdAt) {
      db.prepare('INSERT INTO team_outbox(id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, type, JSON.stringify(payload), 'pending', createdAt);
    },

    listPending() {
      return (db.prepare("SELECT * FROM team_outbox WHERE status IN ('pending', 'failed') ORDER BY created_at, id")
        .all() as Record<string, unknown>[])
        .map((row) => ({
          id: String(row.id),
          type: String(row.type),
          payloadJson: String(row.payload_json),
          status: row.status as OutboxStatus,
          attempts: Number(row.attempts),
          lastError: row.last_error === null ? null : String(row.last_error),
          createdAt: Number(row.created_at),
        }));
    },

    countOutbox() {
      const row = db.prepare("SELECT count(*) AS count FROM team_outbox WHERE status IN ('pending', 'failed')").get() as { count: number };
      return row.count;
    },

    markPending(id, status, lastError) {
      db.prepare('UPDATE team_outbox SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?')
        .run(status, lastError, id);
    },

    clear() {
      const apply = db.transaction(() => {
        db.prepare("DELETE FROM team_meta WHERE key NOT LIKE 'shown:%'").run();
        for (const table of [
          'team_info',
          'team_members',
          'team_tasks',
          'team_task_leaders',
          'team_task_assignees',
          'team_notes',
          'team_events',
          'team_notifications',
          'team_outbox',
        ]) {
          db.prepare(`DELETE FROM ${table}`).run();
        }
      });
      apply();
    },

    close() {
      db.close();
    },

    mergeChanges(changes, cursor) {
      if (!Number.isFinite(cursor) || cursor < 0) throw new Error('INVALID_CURSOR');

      const apply = db.transaction(() => {
        const current = Number(cache.getMeta('cursor') ?? '0');
        if (!Number.isFinite(current) || current < 0) throw new Error('INVALID_CURSOR');
        if (cursor < current) throw new Error('CURSOR_REGRESSION');

        const serverTaskIds = new Set(changes.tasks.map((task) => task.id));
        const localTaskIds = db.prepare('SELECT id FROM team_tasks').all() as { id: string }[];
        for (const { id } of localTaskIds) {
          if (serverTaskIds.has(id)) continue;
          db.prepare('DELETE FROM team_task_assignees WHERE task_id = ?').run(id);
          db.prepare('DELETE FROM team_task_leaders WHERE task_id = ?').run(id);
          db.prepare('DELETE FROM team_notes WHERE task_id = ?').run(id);
          db.prepare('DELETE FROM team_events WHERE task_id = ?').run(id);
          db.prepare('DELETE FROM team_tasks WHERE id = ?').run(id);
        }

        const serverNoteIds = new Set(changes.notes.map((note) => note.id));
        const localNoteIds = db.prepare('SELECT id FROM team_notes').all() as { id: string }[];
        for (const { id } of localNoteIds) {
          if (!serverNoteIds.has(id)) db.prepare('DELETE FROM team_notes WHERE id = ?').run(id);
        }

        cache.replaceMembers(changes.members);
        if (changes.team) cache.setTeam(changes.team);
        for (const note of changes.notes) cache.appendNote(note);
        for (const event of changes.events) cache.appendEvent(event);
        for (const task of changes.tasks) cache.upsertTask(task);
        for (const notification of changes.notifications) cache.upsertNotification(notification);
        cache.setMeta('cursor', String(cursor));
      });
      apply();
    },
  };
  return cache;
}
