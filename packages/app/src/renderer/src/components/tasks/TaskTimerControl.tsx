import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Timer } from 'lucide-react';
import type { Task } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { elapsedOf, formatDuration, remainingOf } from '../../lib/timer';
import { WheelPicker } from '../ui/wheel-picker';
import { cn } from '../ui/utils';

const DURATION_KEY = 'memex:timer-duration-minutes';
const DEFAULT_MINUTES = 25;
const QUICK_MINUTES = [15, 45, 60];

function readDurationMinutes(): number {
  try {
    const raw = localStorage.getItem(DURATION_KEY);
    // 注意 Number(null) 是 0，必须先判空，否则默认时长会变成 0
    if (raw === null) return DEFAULT_MINUTES;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= 24 * 60 ? value : DEFAULT_MINUTES;
  } catch {
    return DEFAULT_MINUTES;
  }
}

function writeDurationMinutes(minutes: number): void {
  try {
    localStorage.setItem(DURATION_KEY, String(minutes));
  } catch {
    // 隐私模式写不进去也无所谓，下次回到默认时长
  }
}

/** 任务详情里的计时入口：没计时时用滚轮选时长，计时中则显示读数并可暂停/继续。 */
export function TaskTimerControl({ task }: { task: Task }) {
  const timer = useAppStore((state) => state.timer);
  const startTimer = useAppStore((state) => state.startTimer);
  const pauseTimer = useAppStore((state) => state.pauseTimer);
  const resumeTimer = useAppStore((state) => state.resumeTimer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(readDurationMinutes);
  const [now, setNow] = useState(() => Date.now());
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const own = timer && timer.taskId === task.id ? timer : null;
  const running = own?.running ?? false;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running, own?.taskId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // 换任务时收起菜单，避免选到一半换了目标
  useEffect(() => setMenuOpen(false), [task.id]);

  if (own) {
    const label =
      own.durationMs === null ? formatDuration(elapsedOf(own, now)) : formatDuration(remainingOf(own, now) ?? 0);
    return (
      <button
        type="button"
        onClick={() => (own.finished ? undefined : own.running ? pauseTimer() : resumeTimer())}
        title={own.finished ? '计时已结束' : own.running ? '暂停计时' : '继续计时'}
        aria-label={own.finished ? '计时已结束' : own.running ? '暂停计时' : '继续计时'}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] tabular-nums transition',
          own.finished
            ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
        )}
      >
        {own.running ? <Pause size={12} /> : <Play size={12} />}
        {own.finished ? '时间到' : label}
      </button>
    );
  }

  const startCountdown = (minutes: number) => {
    if (minutes <= 0) return;
    writeDurationMinutes(minutes);
    startTimer(task, 'countdown', minutes * 60_000);
    setMenuOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="设置任务计时"
        className={cn(
          'relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition-colors duration-150 hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35',
          menuOpen ? 'text-[var(--ink)]' : 'text-[var(--faint)] hover:text-[var(--ink)]',
        )}
      >
        <Timer size={12} /> 计时
        {/* 打开时给一条下划线，和面板形成呼应 */}
        <span
          className={cn(
            'absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full bg-[var(--accent)] transition-opacity duration-150',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[280px] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-[var(--accent)]" />
            <span className="text-[15px] font-medium tracking-tight text-[var(--ink)]">计时</span>
          </div>

          <div className="mt-2 flex items-center justify-center gap-2">
            <WheelPicker
              value={hours}
              onChange={(next) => setDurationMinutes(next * 60 + minutes)}
              min={0}
              max={23}
              label="小时"
              className="w-[86px]"
            />
            <span className="text-[13px] text-[var(--muted)]">时</span>
            <WheelPicker
              value={minutes}
              onChange={(next) => setDurationMinutes(hours * 60 + next)}
              min={0}
              max={59}
              label="分钟"
              className="w-[86px]"
            />
            <span className="text-[13px] text-[var(--muted)]">分</span>
          </div>

          <div className="my-3 h-px bg-[var(--line)]" />

          {/* 快速计时：一键按固定时长开始，不用滚轮 */}
          <div className="flex items-center gap-2">
            {QUICK_MINUTES.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => startCountdown(quick)}
                className="h-10 flex-1 cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface)] text-[13px] text-[var(--muted)] shadow-[var(--shadow-soft)] transition-colors duration-150 hover:border-[var(--line-strong)] hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
              >
                {quick} 分钟
              </button>
            ))}
          </div>

          {/* 两种模式的启动按钮：倒计时用滚轮选的值 */}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => startCountdown(durationMinutes)}
              disabled={durationMinutes <= 0}
              aria-label="开始倒计时"
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-[14px] font-medium text-white shadow-[var(--shadow-soft)] transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={14} /> 倒计时
            </button>
            <button
              type="button"
              onClick={() => {
                startTimer(task, 'stopwatch');
                setMenuOpen(false);
              }}
              aria-label="开始正计时"
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[14px] text-[var(--muted)] shadow-[var(--shadow-soft)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            >
              <Timer size={14} /> 正计时
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
