import { useEffect, useState } from 'react';
import { GripVertical, Pause, Play, Square, Timer } from 'lucide-react';
import type { TaskTimerState } from '@memex/shared';
import { elapsedOf, formatDuration, remainingOf } from '../../lib/timer';
import { cn } from '../ui/utils';

/**
 * 桌面悬浮计时球：主窗口最小化时出现。
 * 固定尺寸、不做展开——透明窗口一旦改尺寸，重排和窗口几何会差几帧，胶囊就会抖。
 * 操作压缩成两个图标：暂停/继续、结束；点读数回到 Memex 看详情。
 */
export function TimerWidgetApp() {
  const [timer, setTimer] = useState<TaskTimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void window.memex.timer.getState().then((state) => {
      if (alive) setTimer(state);
    });
    const off = window.memex.timer.onState((state) => setTimer(state));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const running = timer?.running ?? false;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  if (!timer) return null;

  const remaining = remainingOf(timer, now);
  const label = remaining === null ? formatDuration(elapsedOf(timer, now)) : formatDuration(remaining);
  const paused = !timer.running && !timer.finished;

  return (
    <div
      className={cn(
        'flex h-full w-full items-center gap-1 rounded-full border bg-[var(--surface-2)] px-1.5',
        timer.finished ? 'border-[var(--accent)]/40' : 'border-[var(--line)]',
      )}
    >
      {/* 只有握把是拖动区，其余留给点击 */}
      <span
        className="app-region-drag flex h-8 w-4 shrink-0 cursor-grab items-center justify-center text-[var(--faint)]"
        title="拖动"
      >
        <GripVertical size={12} />
      </span>

      <button
        type="button"
        onClick={() => window.memex.timer.sendAction('open')}
        title="回到 Memex"
        aria-label="回到 Memex"
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full px-1.5 transition-colors duration-150 hover:bg-[var(--hover)]"
      >
        <Timer size={12} className={cn('shrink-0', timer.finished ? 'text-[var(--accent)]' : 'text-[var(--faint)]')} />
        <span
          className={cn(
            'whitespace-nowrap text-[13px] font-medium tabular-nums',
            timer.finished ? 'text-[var(--accent)]' : paused ? 'text-[var(--muted)]' : 'text-[var(--ink)]',
          )}
        >
          {label}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (timer.finished) return;
          window.memex.timer.sendAction(timer.running ? 'pause' : 'resume');
        }}
        disabled={timer.finished}
        title={timer.running ? '暂停' : '继续'}
        aria-label={timer.running ? '暂停计时' : '继续计时'}
        className="flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {timer.running ? <Pause size={13} /> : <Play size={13} />}
      </button>

      <button
        type="button"
        onClick={() => window.memex.timer.sendAction('stop')}
        title="结束计时"
        aria-label="结束计时"
        className="flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--faint)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-red-500"
      >
        <Square size={12} />
      </button>
    </div>
  );
}
