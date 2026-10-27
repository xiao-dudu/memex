import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskTimerBar } from '../TaskTimerBar';
import { useAppStore } from '../../../store/useAppStore';
import { createTimer } from '../../../lib/timer';

const MINUTE = 60_000;

beforeEach(() => {
  useAppStore.setState({
    module: 'tasks',
    timer: createTimer({ id: 'task-1', title: '写周报' }, 'countdown', 25 * MINUTE, Date.now()),
    openTask: async () => undefined,
  });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ timer: null });
});

describe('task timer bar', () => {
  it('任务页只显示窄条，离开任务页横向撑开并露出任务标题', async () => {
    render(<TaskTimerBar />);
    const compact = screen.getByRole('button', { name: /任务计时/ });
    // 真实时钟在 setInterval 里走，允许跨过一秒的误差
    expect(compact.textContent).toMatch(/^2[45]:\d{2}$/);
    expect(compact.textContent).not.toContain('写周报');
    expect(compact.className).toContain('w-[104px]');

    useAppStore.setState({ module: 'notes' });

    await waitFor(() => {
      const expanded = screen.getByRole('button', { name: /任务计时/ });
      expect(expanded.textContent).toContain('写周报');
      expect(expanded.className).toContain('w-full');
    });
  });

  it('鼠标移入展开操作卡片，移开收回', async () => {
    render(<TaskTimerBar />);
    const pill = screen.getByRole('button', { name: /^任务计时/ });

    expect(screen.queryByText('打开任务')).toBeNull();

    fireEvent.mouseEnter(pill);
    expect(screen.getByText('打开任务')).not.toBeNull();
    expect(screen.getByText('暂停')).not.toBeNull();

    fireEvent.mouseLeave(pill);
    await waitFor(() => expect(screen.queryByText('打开任务')).toBeNull());
  });

  it('到点后自动弹出卡片并显示“时间到”', () => {
    useAppStore.setState({
      timer: {
        ...createTimer({ id: 'task-1', title: '写周报' }, 'countdown', MINUTE, Date.now()),
        running: false,
        finished: true,
        accumulatedMs: MINUTE,
      },
    });
    render(<TaskTimerBar />);

    expect(screen.getByText('时间到')).not.toBeNull();
    expect(screen.getByText('打开任务')).not.toBeNull();
  });

  it('暂停中的计时器显示“已暂停”', () => {
    useAppStore.setState({
      timer: { ...createTimer({ id: 'task-1', title: '写周报' }, 'stopwatch', null, Date.now()), running: false },
    });
    render(<TaskTimerBar />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^任务计时/ }));

    expect(screen.getByText(/已暂停/)).not.toBeNull();
    expect(screen.getByText('继续')).not.toBeNull();
  });
});
