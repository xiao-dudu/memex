import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cn } from './utils';

export interface WheelPickerProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  /** 单位直接标在中间那行的右侧，避免单位飘在两列之间。 */
  unit?: string;
  itemHeight?: number;
  /** 可见行数，必须是奇数，保证有一行正好落在中间。 */
  visibleCount?: number;
  className?: string;
}

/**
 * iOS 闹钟那种滚轮选择器：靠 scroll-snap 停在整行上，
 * 再按每行离中心的距离做 rotateX + 缩放 + 透明，做出圆柱滚动的感觉。
 */
export function WheelPicker({
  value,
  onChange,
  min,
  max,
  label,
  unit,
  itemHeight = 26,
  visibleCount = 5,
  className,
}: WheelPickerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const frameRef = useRef<number | null>(null);
  const settleRef = useRef<number | null>(null);
  /** 由本组件滚动触发的值变化，回灌到 props 时不要反向再滚一次。 */
  const emittedRef = useRef<number | null>(null);
  /** 连续滚轮事件之间可能还没重渲染，用 ref 保存最新值，避免丢步。 */
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pad = Math.floor(visibleCount / 2) * itemHeight;

  const items = useMemo(() => Array.from({ length: max - min + 1 }, (_, index) => min + index), [min, max]);

  const applyTransforms = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const offset = el.scrollTop / itemHeight;
    itemRefs.current.forEach((node, index) => {
      if (!node) return;
      const delta = index - offset;
      const distance = Math.abs(delta);
      const rotate = Math.max(-72, Math.min(72, delta * -20));
      // 中间那颗明显更大更实，两侧快速衰减，接近 iOS 滚轮的层次
      const scale = Math.max(0.62, 1.18 - distance * 0.24);
      const opacity = Math.max(0.18, 1 - distance * 0.3);
      node.style.transform = `rotateX(${rotate}deg) scale(${scale}) translateZ(${-distance * 6}px)`;
      node.style.opacity = String(opacity);
    });
  }, [itemHeight]);

  const scrollToValue = useCallback(
    (next: number, smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = (next - min) * itemHeight;
      try {
        el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
      } catch {
        // jsdom 里 scrollTo 没实现，直接赋值兜底
        el.scrollTop = top;
      }
      applyTransforms();
    },
    [applyTransforms, itemHeight, min],
  );

  // 外部改值（或父组件确认后）同步回 ref
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 首次渲染与外部改值时对齐位置（不用 smooth，避免打开时先滚一段）
  useLayoutEffect(() => {
    if (emittedRef.current === value) return;
    scrollToValue(value, false);
  }, [value, scrollToValue]);

  useEffect(() => {
    applyTransforms();
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    };
  }, [applyTransforms]);

  const handleScroll = () => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      applyTransforms();
    });

    // 停手 90ms 后再提交值，避免滚动过程中疯狂触发上层重渲染
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const index = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / itemHeight)));
      const next = min + index;
      if (next !== value) {
        emittedRef.current = next;
        onChange(next);
      }
    }, 90);
  };

  /** 一次只走一行，滚轮/键盘/点击共用。 */
  const stepBy = useCallback(
    (delta: number) => {
      const current = valueRef.current;
      const next = Math.min(max, Math.max(min, current + delta));
      if (next === current) return;
      valueRef.current = next;
      emittedRef.current = next;
      onChangeRef.current(next);
      scrollToValue(next, true);
    },
    [max, min, scrollToValue],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    stepBy(event.key === 'ArrowDown' ? 1 : -1);
  };

  /**
   * 自己接管滚轮：原生滚动一格约 100px，行高只有 26px，
   * 一格会跳将近 4 行，吸附后只能停在 4 的倍数上（1/2/3 永远选不到）。
   * 这里一格只走一行，和 iOS 的手感一致。
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      stepBy(event.deltaY > 0 ? 1 : -1);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // stepBy 每次都读最新的 valueRef，不需要重新绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, itemHeight]);

  return (
    <div
      className={cn('relative select-none', className)}
      style={{ height: itemHeight * visibleCount, perspective: '600px' }}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 中间的高亮胶囊，暗示"停在这里" */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full"
        style={{
          height: itemHeight,
          background: 'color-mix(in srgb, var(--line) 68%, transparent)',
        }}
      />
      {/* 单位贴在胶囊内侧右边，跟着高亮行一起读，不再飘在两列之间 */}
      {unit ? (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] leading-none text-[var(--faint)]">
          {unit}
        </span>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="wheel-scroll relative h-full overflow-y-auto"
        style={{
          paddingTop: pad,
          paddingBottom: pad,
          scrollSnapType: 'y mandatory',
          transformStyle: 'preserve-3d',
        }}
      >
        {items.map((item, index) => (
          <button
            key={item}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="option"
            aria-selected={item === value}
            onClick={() => {
              valueRef.current = item;
              emittedRef.current = item;
              onChange(item);
              scrollToValue(item, true);
            }}
            className={cn(
              'wheel-item flex w-full items-center justify-center text-[14px] tabular-nums transition-colors',
              item === value ? 'font-semibold text-[var(--ink)]' : 'font-normal text-[var(--muted)]',
            )}
            style={{ height: itemHeight, scrollSnapAlign: 'center' }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
