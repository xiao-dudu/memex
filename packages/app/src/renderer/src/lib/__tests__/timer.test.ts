import { describe, expect, it } from 'vitest';
import { createTimer, elapsedOf, formatDuration, progressOf, remainingOf } from '../timer';

const T0 = Date.UTC(2026, 9, 27, 1, 0, 0);
const MINUTE = 60_000;

describe('task timer math', () => {
  it('倒计时用时间戳推进，剩余时间随之减少', () => {
    const timer = createTimer({ id: 't1', title: '写周报' }, 'countdown', 25 * MINUTE, T0);
    expect(remainingOf(timer, T0)).toBe(25 * MINUTE);
    expect(remainingOf(timer, T0 + MINUTE)).toBe(24 * MINUTE);
    expect(progressOf(timer, T0 + MINUTE)).toBeCloseTo(1 / 25);
  });

  it('暂停期间不再走时', () => {
    const timer = { ...createTimer({ id: 't1', title: 'x' }, 'countdown', 25 * MINUTE, T0), running: false, accumulatedMs: 30_000 };
    expect(elapsedOf(timer, T0 + 999_999)).toBe(30_000);
    expect(remainingOf(timer, T0 + 999_999)).toBe(25 * MINUTE - 30_000);
  });

  it('正计时没有剩余时间，durationMs 归一为 null', () => {
    const timer = createTimer({ id: 't1', title: 'x' }, 'stopwatch', 25 * MINUTE, T0);
    expect(timer.durationMs).toBeNull();
    expect(remainingOf(timer, T0 + 5_000)).toBeNull();
    expect(progressOf(timer, T0 + 5_000)).toBeNull();
    expect(elapsedOf(timer, T0 + 5_000)).toBe(5_000);
  });

  it('到点后剩余归零而不是负数', () => {
    const timer = createTimer({ id: 't1', title: 'x' }, 'countdown', 1_000, T0);
    expect(remainingOf(timer, T0 + 5_000)).toBe(0);
    expect(progressOf(timer, T0 + 5_000)).toBe(1);
  });

  it('已结束的计时器剩余时间固定为 0', () => {
    const timer = { ...createTimer({ id: 't1', title: 'x' }, 'countdown', MINUTE, T0), finished: true, running: false, accumulatedMs: MINUTE };
    expect(remainingOf(timer, T0 + 10 * MINUTE)).toBe(0);
  });

  it('格式化成 mm:ss 与 h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
  });
});
