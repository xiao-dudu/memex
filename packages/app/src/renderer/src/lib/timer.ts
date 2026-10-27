import type { TaskTimerMode, TaskTimerState } from '@memex/shared';

export type { TaskTimerMode, TaskTimerState };

export function createTimer(
  task: { id: string; title: string },
  mode: TaskTimerMode,
  durationMs: number | null,
  now: number,
): TaskTimerState {
  return {
    taskId: task.id,
    taskTitle: task.title,
    mode,
    durationMs: mode === 'countdown' ? durationMs : null,
    startedAt: now,
    accumulatedMs: 0,
    running: true,
    finished: false,
  };
}

/** 已用时长：用时间戳算，避免 setInterval 漂移和后台节流。 */
export function elapsedOf(timer: TaskTimerState, now: number): number {
  const current = timer.running ? Math.max(0, now - timer.startedAt) : 0;
  return timer.accumulatedMs + current;
}

/** 倒计时剩余毫秒；正计时返回 null。 */
export function remainingOf(timer: TaskTimerState, now: number): number | null {
  if (timer.durationMs === null) return null;
  if (timer.finished) return 0;
  return Math.max(0, timer.durationMs - elapsedOf(timer, now));
}

/** 倒计时进度 0..1；正计时返回 null。 */
export function progressOf(timer: TaskTimerState, now: number): number | null {
  if (timer.durationMs === null || timer.durationMs <= 0) return null;
  const remaining = remainingOf(timer, now) ?? 0;
  return Math.min(1, Math.max(0, 1 - remaining / timer.durationMs));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
