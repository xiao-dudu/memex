import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Pause, Play, Plus, Square, Timer } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { elapsedOf, formatDuration, progressOf, remainingOf } from '../../lib/timer';
import { cn } from '../ui/utils';

const EXTEND_MS = 5 * 60 * 1000;

export function TaskTimerBar() {
  const timer = useAppStore((state) => state.timer);
  const module = useAppStore((state) => state.module);
  const pauseTimer = useAppStore((state) => state.pauseTimer);
  const resumeTimer = useAppStore((state) => state.resumeTimer);
  const stopTimer = useAppStore((state) => state.stopTimer);
  const extendTimer = useAppStore((state) => state.extendTimer);
  const finishTimer = useAppStore((state) => state.finishTimer);
  const openTask = useAppStore((state) => state.openTask);

  const [now, setNow] = useState(() => Date.now());
  const [cardOpen, setCardOpen] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const chimeRef = useRef(false);

  const running = timer?.running ?? false;

  // 用时间戳每秒重算，不做自减计数：窗口被节流或休眠后回来仍然准确。
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running, timer?.taskId]);

  // 倒计时归零
  useEffect(() => {
    if (!timer || timer.finished || timer.durationMs === null) return;
    if (remainingOf(timer, now) === 0) finishTimer();
  }, [timer, now, finishTimer]);

  // 到点提醒：响一次，小条闪几秒
  useEffect(() => {
    if (!timer?.finished) {
      chimeRef.current = false;
      setFlashing(false);
      return;
    }
    if (chimeRef.current) return;
    chimeRef.current = true;
    setFlashing(true);
    playChime();
    const id = window.setTimeout(() => setFlashing(false), 6000);
    return () => window.clearTimeout(id);
  }, [timer?.finished, timer?.taskId]);

  // 计时结束后卡片自动弹出来一次，让人知道该处理了。
  useEffect(() => {
    if (!timer?.finished) return;
    setCardOpen(true);
  }, [timer?.finished]);

  if (!timer) return null;

  const remaining = remainingOf(timer, now);
  const label = remaining === null ? formatDuration(elapsedOf(timer, now)) : formatDuration(remaining);
  const progress = progressOf(timer, now);
  const paused = !timer.running && !timer.finished;
  const expanded = module !== 'tasks';

  return (
    <div className="relative z-20 flex h-9 shrink-0 items-center border-b border-[var(--line)] bg-[var(--bg)] px-3">
      {/* 悬停展开、移开收回：鼠标从胶囊移到卡片上不会误关，因为卡片也是它的子节点 */}
      <div
        className={cn('relative', expanded && 'flex flex-1')}
        onMouseEnter={() => setCardOpen(true)}
        onMouseLeave={() => setCardOpen(false)}
        onFocus={() => setCardOpen(true)}
        onBlur={() => setCardOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setCardOpen(false);
        }}
      >
      <motion.button
        type="button"
        layout
        onClick={() => setCardOpen(true)}
        aria-expanded={cardOpen}
        aria-label={`任务计时 ${label}，悬停展开操作`}
        className={cn(
          'flex h-7 items-center gap-2 overflow-hidden rounded-full border px-2.5 text-[12px] transition-colors',
          expanded ? 'w-full' : 'w-[104px]',
          timer.finished
            ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]',
          paused && 'text-[var(--muted)]',
          flashing && 'animate-pulse',
        )}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        <Timer size={12} className={cn('shrink-0', timer.finished ? 'text-[var(--accent)]' : 'text-[var(--faint)]')} />
        {expanded ? (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{timer.taskTitle}</span>
            {progress !== null ? (
              <span className="relative hidden h-1 w-28 shrink-0 overflow-hidden rounded-full bg-[var(--line)] sm:block">
                <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${progress * 100}%` }} />
              </span>
            ) : null}
          </>
        ) : null}
        <span className="shrink-0 font-medium tabular-nums">{label}</span>
      </motion.button>

      <AnimatePresence>
        {cardOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-[calc(100%+6px)] w-[264px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 shadow-[0_12px_32px_rgba(52,44,32,0.10)]"
          >
            <p className="truncate text-[12px] font-medium text-[var(--ink)]">{timer.taskTitle}</p>
            <p className="mt-0.5 text-[11px] text-[var(--faint)]">
              {timer.mode === 'countdown' ? '倒计时' : '正计时'} ·{' '}
              <span>{timer.finished ? '时间到' : paused ? '已暂停' : '进行中'}</span>
            </p>
            <p className="mt-2 font-serif text-[24px] leading-none tabular-nums text-[var(--ink)]">{label}</p>

            <div className="mt-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (timer.finished) return;
                  if (timer.running) pauseTimer();
                  else resumeTimer();
                }}
                disabled={timer.finished}
                className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] text-[12px] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:opacity-40"
              >
                {timer.running ? <Pause size={12} /> : <Play size={12} />}
                {timer.running ? '暂停' : '继续'}
              </button>
              {timer.durationMs !== null ? (
                <button
                  type="button"
                  onClick={() => extendTimer(EXTEND_MS)}
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] text-[12px] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <Plus size={12} /> 5 分钟
                </button>
              ) : null}
              <button
                type="button"
                onClick={stopTimer}
                title="结束计时"
                aria-label="结束计时"
                className="inline-flex h-7 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-red-500"
              >
                <Square size={12} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCardOpen(false);
                void openTask(timer.taskId);
              }}
              className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              <ArrowUpRight size={12} /> 打开任务
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
    </div>
  );
}

/** 到点提示音：用 WebAudio 合成，避免为一个提示音引入音频资源。 */
function playChime() {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const start = ctx.currentTime;
    [880, 1180].forEach((frequency, index) => {
      const offset = index * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.24);
    });
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    // 静音或没有音频设备时静默跳过，不该因为提示音影响计时
  }
}
