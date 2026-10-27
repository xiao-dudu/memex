import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@memex/shared';
import { TaskTimerControl } from '../TaskTimerControl';
import { useAppStore } from '../../../store/useAppStore';

const task: Task = {
  id: 'task-1',
  title: '写周报',
  description: null,
  descriptionJson: null,
  status: 'todo',
  priority: 'medium',
  dueAt: null,
  noteId: null,
  noteTitle: null,
  noteInTrash: false,
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
  deletedAt: null,
  tags: [],
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ timer: null });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ timer: null });
});

describe('task timer control', () => {
  it('快速计时按钮直接按固定时长开始倒计时', () => {
    render(<TaskTimerControl task={task} />);
    fireEvent.click(screen.getByRole('button', { name: '设置任务计时' }));
    fireEvent.click(screen.getByRole('button', { name: '15 分钟' }));

    const timer = useAppStore.getState().timer;
    expect(timer?.mode).toBe('countdown');
    expect(timer?.durationMs).toBe(15 * 60_000);
    // 记住上次选的时长，下次打开滚轮停在这里
    expect(localStorage.getItem('memex:timer-duration-minutes')).toBe('15');
  });

  it('倒计时按钮使用滚轮当前值（默认 25 分钟）', () => {
    render(<TaskTimerControl task={task} />);
    fireEvent.click(screen.getByRole('button', { name: '设置任务计时' }));
    fireEvent.click(screen.getByRole('button', { name: '开始倒计时' }));

    expect(useAppStore.getState().timer?.durationMs).toBe(25 * 60_000);
  });

  it('正计时按钮启动秒表，没有总时长', () => {
    render(<TaskTimerControl task={task} />);
    fireEvent.click(screen.getByRole('button', { name: '设置任务计时' }));
    fireEvent.click(screen.getByRole('button', { name: '开始正计时' }));

    const timer = useAppStore.getState().timer;
    expect(timer?.mode).toBe('stopwatch');
    expect(timer?.durationMs).toBeNull();
  });

  it('计时中入口变成读数，点击可暂停', () => {
    useAppStore.getState().startTimer({ id: task.id, title: task.title }, 'countdown', 25 * 60_000);
    render(<TaskTimerControl task={task} />);

    const readout = screen.getByRole('button', { name: '暂停计时' });
    expect(readout.textContent).toMatch(/^2[45]:\d{2}$/);

    fireEvent.click(readout);
    expect(useAppStore.getState().timer?.running).toBe(false);
    expect(screen.getByRole('button', { name: '继续计时' })).not.toBeNull();
  });
});
