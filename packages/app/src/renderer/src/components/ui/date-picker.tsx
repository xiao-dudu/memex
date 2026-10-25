import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from './utils';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const PANEL_WIDTH = 268;
const PANEL_GAP = 6;
// 面板高度随是否带时间变化，用于判断向下展开会不会出屏
const PANEL_HEIGHT = { date: 306, datetime: 348 };

export interface DatePickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** 是否附带时间（任务截止时间用），默认只选日期 */
  withTime?: boolean;
  placeholder?: string;
  label?: string;
  className?: string;
  /** 关闭后不显示清除入口（用于必须填写的场景，如周报起止日期） */
  allowClear?: boolean;
  disabled?: boolean;
}

function startOfDay(value: number): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** 以周一为首列，固定 6 行，避免切换月份时面板高度跳动 */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function formatTrigger(value: number, withTime: boolean): string {
  const date = new Date(value);
  const today = new Date();
  const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
  const prefix = date.getFullYear() === today.getFullYear() ? '' : `${date.getFullYear()}年`;
  const base = `${prefix}${date.getMonth() + 1}月${date.getDate()}日 · 周${weekday}`;
  if (!withTime) return base;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${base} ${time}`;
}

/** 接受 18:00 / 1800 / 18 三种写法，解析失败返回 null */
function parseTime(input: string): { hours: number; minutes: number } | null {
  const clean = input.trim().replace(/[：.]/g, ':');
  const match = clean.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function DatePicker({
  value,
  onChange,
  withTime = false,
  placeholder = '选择日期',
  label,
  className,
  allowClear = true,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [view, setView] = useState(() => {
    const base = new Date(value ?? Date.now());
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [cursor, setCursor] = useState<number>(value ?? Date.now());
  const [timeDraft, setTimeDraft] = useState('');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => buildGrid(view.year, view.month), [view]);
  const todayStart = startOfDay(Date.now());

  const openPanel = () => {
    const anchor = triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const base = new Date(value ?? Date.now());
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setCursor(value ?? Date.now());
    setTimeDraft(
      value && withTime
        ? `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`
        : '09:00',
    );
    const height = withTime ? PANEL_HEIGHT.datetime : PANEL_HEIGHT.date;
    const fitsBelow = rect.bottom + PANEL_GAP + height <= window.innerHeight - 8;
    setPosition({
      top: fitsBelow
        ? rect.bottom + PANEL_GAP
        : Math.max(8, Math.min(rect.top - height - PANEL_GAP, window.innerHeight - height - 8)),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
    });
    setOpen(true);
  };

  const closePanel = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // 打开后把焦点交给面板，方向键可以直接用
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // 键盘移动时同步真实焦点，保证读屏和视觉一致
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${startOfDay(cursor)}"]`);
    node?.focus();
  }, [cursor, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (dayValue: number) => {
    const next = new Date(dayValue);
    if (withTime) {
      const parsed = parseTime(timeDraft) ?? { hours: 9, minutes: 0 };
      next.setHours(parsed.hours, parsed.minutes, 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    onChange(next.getTime());
    closePanel();
  };

  const pickQuick = (daysFromToday: number) => {
    const next = new Date();
    next.setDate(next.getDate() + daysFromToday);
    commit(startOfDay(next.getTime()));
  };

  const pickNextMonday = () => {
    const next = new Date();
    const delta = (8 - next.getDay()) % 7 || 7;
    next.setDate(next.getDate() + delta);
    commit(startOfDay(next.getTime()));
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  const moveCursor = (deltaDays: number) => {
    const next = new Date(cursor);
    next.setDate(next.getDate() + deltaDays);
    setCursor(next.getTime());
    if (next.getMonth() !== view.month || next.getFullYear() !== view.year) {
      setView({ year: next.getFullYear(), month: next.getMonth() });
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = map[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      moveCursor(delta);
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      shiftMonth(event.key === 'PageUp' ? -1 : 1);
    }
  };

  const overdue = value !== null && value < Date.now();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? closePanel(false) : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          'group inline-flex h-8 max-w-full items-center gap-2 rounded-lg px-2 text-[13px] transition disabled:pointer-events-none disabled:opacity-45',
          value ? 'text-[var(--ink)]' : 'text-[var(--faint)]',
          overdue ? 'text-red-600' : '',
          'hover:bg-[var(--hover)]',
          className,
        )}
      >
        <CalendarDays size={13} className={cn('shrink-0', overdue ? 'text-red-500' : 'text-[var(--faint)]')} />
        <span className="truncate">{value ? formatTrigger(value, withTime) : placeholder}</span>
        {value && allowClear ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="清除截止时间"
            title="清除"
            onClick={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onChange(null);
              }
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--faint)] opacity-0 transition hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X size={11} />
          </span>
        ) : null}
      </button>

      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={label ? `${label}选择器` : '选择日期'}
              tabIndex={-1}
              onKeyDown={onPanelKeyDown}
              initial={{ opacity: 0, y: -4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.14 }}
              style={{ position: 'fixed', top: position.top, left: position.left, width: PANEL_WIDTH }}
              className="z-[70] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 shadow-[var(--shadow)] outline-none"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">
                  {view.year}年{view.month + 1}月
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="上个月"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="下个月"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {[
                  { label: '今天', run: () => pickQuick(0) },
                  { label: '明天', run: () => pickQuick(1) },
                  { label: '下周一', run: pickNextMonday },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={preset.run}
                    className="h-6 rounded-md bg-[var(--hover)] px-2 text-[12px] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    {preset.label}
                  </button>
                ))}
                {allowClear ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      closePanel();
                    }}
                    className="ml-auto h-6 rounded-md px-2 text-[12px] text-[var(--faint)] transition hover:text-red-500"
                  >
                    清除
                  </button>
                ) : null}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-y-0.5 text-center">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-1 text-[12px] text-[var(--faint)]">
                    {day}
                  </span>
                ))}
                {days.map((day) => {
                  const ts = day.getTime();
                  const outside = day.getMonth() !== view.month;
                  const selected = value !== null && isSameDay(ts, value);
                  const isToday = isSameDay(ts, todayStart);
                  return (
                    <button
                      key={ts}
                      type="button"
                      data-day={startOfDay(ts)}
                      tabIndex={-1}
                      onClick={() => commit(ts)}
                      aria-current={isToday ? 'date' : undefined}
                      className={cn(
                        'mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[12px] tabular-nums transition',
                        selected
                          ? 'bg-[var(--accent)] font-medium text-white'
                          : outside
                            ? 'text-[var(--faint)] hover:bg-[var(--hover)]'
                            : 'text-[var(--ink)] hover:bg-[var(--hover)]',
                        !selected && isToday ? 'ring-1 ring-inset ring-[var(--accent)]/45' : '',
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              {withTime ? (
                <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-2">
                  <span className="text-[12px] text-[var(--faint)]">时间</span>
                  <input
                    value={timeDraft}
                    onChange={(event) => setTimeDraft(event.target.value)}
                    onBlur={() => {
                      const parsed = parseTime(timeDraft);
                      if (!parsed) {
                        setTimeDraft('09:00');
                        return;
                      }
                      setTimeDraft(`${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`);
                    }}
                    aria-label="截止时间"
                    placeholder="09:00"
                    className="h-7 w-16 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-[12px] tabular-nums outline-none focus:border-[var(--accent)]/50"
                  />
                  <span className="text-[12px] text-[var(--faint)]">留空按 09:00</span>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
