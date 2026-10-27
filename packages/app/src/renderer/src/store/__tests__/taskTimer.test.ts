import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../useAppStore';
import { elapsedOf, remainingOf } from '../../lib/timer';

const T0 = Date.UTC(2026, 9, 27, 1, 0, 0);
const MINUTE = 60_000;
const task = { id: 'task-1', title: '写周报' };

beforeEach(() => {
  useAppStore.setState({ timer: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('task timer actions', () => {
  it('开始计时会替换掉上一个计时器', () => {
    const { startTimer } = useAppStore.getState();
    startTimer(task, 'countdown', 25 * MINUTE);
    startTimer({ id: 'task-2', title: '另一个任务' }, 'stopwatch');

    const timer = useAppStore.getState().timer;
    expect(timer?.taskId).toBe('task-2');
    expect(timer?.mode).toBe('stopwatch');
    expect(timer?.durationMs).toBeNull();
  });

  it('暂停后已用时长冻结，继续后接着累加', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const store = useAppStore.getState();
    store.startTimer(task, 'countdown', 25 * MINUTE);

    vi.setSystemTime(T0 + 10_000);
    store.pauseTimer();
    const paused = useAppStore.getState().timer!;
    expect(paused.running).toBe(false);
    expect(elapsedOf(paused, T0 + 99_999)).toBe(10_000);

    vi.setSystemTime(T0 + 20_000);
    store.resumeTimer();
    const resumed = useAppStore.getState().timer!;
    expect(resumed.running).toBe(true);
    expect(elapsedOf(resumed, T0 + 25_000)).toBe(15_000);
    expect(remainingOf(resumed, T0 + 25_000)).toBe(25 * MINUTE - 15_000);
  });

  it('加时会把已到点的计时器重新跑起来', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const store = useAppStore.getState();
    store.startTimer(task, 'countdown', MINUTE);

    vi.setSystemTime(T0 + MINUTE);
    store.finishTimer();
    expect(useAppStore.getState().timer?.finished).toBe(true);

    vi.setSystemTime(T0 + MINUTE + 1_000);
    store.extendTimer(5 * MINUTE);
    const extended = useAppStore.getState().timer!;
    expect(extended.finished).toBe(false);
    expect(extended.running).toBe(true);
    expect(remainingOf(extended, T0 + MINUTE + 1_000)).toBe(5 * MINUTE);
  });

  it('正计时也能加时（不改 durationMs，只影响倒计时）', () => {
    const store = useAppStore.getState();
    store.startTimer(task, 'stopwatch');
    store.extendTimer(5 * MINUTE);
    expect(useAppStore.getState().timer?.durationMs).toBeNull();
  });

  it('结束计时清空状态', () => {
    const store = useAppStore.getState();
    store.startTimer(task, 'countdown', MINUTE);
    store.stopTimer();
    expect(useAppStore.getState().timer).toBeNull();
  });

  it('已结束的计时器不能被继续', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const store = useAppStore.getState();
    store.startTimer(task, 'countdown', MINUTE);
    store.finishTimer();
    store.resumeTimer();
    expect(useAppStore.getState().timer?.running).toBe(false);
  });
});
