import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Timer } from 'lucide-react';
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
  const stopTimer = useAppStore((state) => state.stopTimer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
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
      <div className="flex items-center gap-1">
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
        <button
          type="button"
          onClick={stopTimer}
          title="结束计时"
          aria-label="结束计时"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--line)] text-[var(--faint)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        >
          <Square size={11} />
        </button>
      </div>
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
        <div className="absolute right-0 top-[calc(100%+5px)] z-30 w-[248px] rounded-[20px] border border-[var(--line)] bg-[var(--surface-2)] p-3 shadow-[var(--shadow)]">
          {/* 第一步就选模式：倒计时要选时长，正计时直接开始 */}
          <div className="flex rounded-full bg-[var(--hover)] p-0.5">
            {(['countdown', 'stopwatch'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                aria-pressed={mode === item}
                className={cn(
                  'h-7 flex-1 cursor-pointer rounded-full text-[12px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35',
                  mode === item
                    ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)] shadow-[var(--shadow-soft)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]',
                )}
              >
                {item === 'countdown' ? '倒计时' : '正计时'}
              </button>
            ))}
          </div>

          {mode === 'countdown' ? (
            <>
              <div className="mt-3 flex items-center justify-center gap-2">
                <WheelPicker
                  value={hours}
                  onChange={(next) => setDurationMinutes(next * 60 + minutes)}
                  min={0}
                  max={23}
                  label="小时"
                  unit="时"
                  className="w-[68px]"
                />
                <WheelPicker
                  value={minutes}
                  onChange={(next) => setDurationMinutes(hours * 60 + next)}
                  min={0}
                  max={59}
                  label="分钟"
                  unit="分"
                  className="w-[68px]"
                />
              </div>

              {/* 常用预设：做成独立卡片，和上面的滚轮区拉开层次 */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {QUICK_MINUTES.map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => startCountdown(quick)}
                    className="h-9 cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[11px] text-[var(--muted)] transition-colors duration-150 hover:border-[var(--line-strong)] hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                  >
                    {quick} 分钟
                  </button>
                ))}
              </div>

              {/* 主操作只留图标：底色跟面板一致，靠图标本身的 accent 色引导 */}
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => startCountdown(durationMinutes)}
                  disabled={durationMinutes <= 0}
                  aria-label="开始倒计时"
                  title="开始倒计时"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--accent)] transition-colors duration-150 hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Play size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 text-center text-[11px] leading-5 text-[var(--faint)]">
                从现在开始往上累计
                <br />
                随时可以暂停
              </p>
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    startTimer(task, 'stopwatch');
                    setMenuOpen(false);
                  }}
                  aria-label="开始正计时"
                  title="开始正计时"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--accent)] transition-colors duration-150 hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                >
                  <Play size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
