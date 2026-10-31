import { deriveTeamTaskState, type TeamSessionInfo, type TeamTask } from '@memex/shared';
import type { TeamCache } from './team-cache.js';

export interface TeamNotificationController {
  showUnread(session: TeamSessionInfo): number;
  scanDue(session: TeamSessionInfo): number;
}

interface Options {
  cache: TeamCache;
  notify: (title: string, body: string) => void;
  now: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createTeamNotificationController({ cache, notify, now }: Options): TeamNotificationController {
  const hasShown = (key: string): boolean => cache.getMeta(`shown:${key}`) === '1';

  const showOnce = (key: string, title: string, body: string): boolean => {
    if (hasShown(key)) return false;
    notify(title, body);
    cache.setMeta(`shown:${key}`, '1');
    return true;
  };

  const visibleTasks = (session: TeamSessionInfo): TeamTask[] => {
    if (!session.userId || !session.role) return [];
    return cache.listTasks({ view: 'all' }, session.userId, session.role, now());
  };

  return {
    showUnread(session) {
      if (!session.userId) return 0;
      let shown = 0;
      for (const notification of cache.listNotifications(session.userId)) {
        if (notification.readAt !== null || notification.id.startsWith('local:')) continue;
        if (showOnce(`server:${notification.id}`, notification.title, notification.body)) shown += 1;
      }
      return shown;
    },

    scanDue(session) {
      if (!session.userId || !session.role) return 0;
      const current = now();
      let shown = 0;
      for (const task of visibleTasks(session)) {
        if (task.dueAt === null || deriveTeamTaskState(task) !== 'in_progress') continue;
        const relevant = task.createdBy === session.userId
          || task.leaders.some((leader) => leader.id === session.userId)
          || task.assignees.some((assignee) => assignee.id === session.userId
            && ['todo', 'doing', 'submitted'].includes(assignee.status));
        if (!relevant) continue;
        const dueKey = `${task.id}:${task.dueAt}:${session.userId}`;
        if (task.dueAt <= current) {
          const id = `local:overdue:${dueKey}`;
          if (hasShown(id)) continue;
          cache.upsertNotification({
            id,
            teamId: task.teamId,
            userId: session.userId,
            type: 'overdue',
            taskId: task.id,
            title: '任务已逾期',
            body: task.title,
            readAt: null,
            createdAt: current,
          });
          if (showOnce(id, '任务已逾期', task.title)) shown += 1;
        } else if (task.dueAt - current <= DAY_MS) {
          const id = `local:due24:${dueKey}`;
          if (hasShown(id)) continue;
          cache.upsertNotification({
            id,
            teamId: task.teamId,
            userId: session.userId,
            type: 'due_soon',
            taskId: task.id,
            title: '任务将在 24 小时内到期',
            body: task.title,
            readAt: null,
            createdAt: current,
          });
          if (showOnce(id, '任务将在 24 小时内到期', task.title)) shown += 1;
        }
      }
      return shown;
    },
  };
}