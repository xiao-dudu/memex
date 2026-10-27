import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MemexApi, TaskTimerState } from '@memex/shared';
import { TimerWidgetApp } from '../TimerWidgetApp';

const timer: TaskTimerState = {
  taskId: 'task-1',
  taskTitle: '交罚款时间段',
  mode: 'countdown',
  durationMs: 15 * 60_000,
  startedAt: Date.now(),
  accumulatedMs: 0,
  running: true,
  finished: false,
};

let sendAction: ReturnType<typeof vi.fn>;

function mockApi(state: TaskTimerState | null) {
  sendAction = vi.fn();
  window.memex = {
    timer: {
      getState: () => Promise.resolve(state),
      onState: () => () => undefined,
      sendAction,
    },
  } as unknown as MemexApi;
}

beforeEach(() => {
  mockApi(timer);
});

afterEach(() => {
  cleanup();
});

describe('timer widget', () => {
  it('固定尺寸地显示剩余时间，不提供展开', async () => {
    render(<TimerWidgetApp />);
    await waitFor(() => expect(screen.getByText(/^1[45]:\d{2}$/)).not.toBeNull());

    // 没有卡片、没有展开按钮
    expect(screen.queryByText('打开任务')).toBeNull();
    expect(screen.queryByText('暂停')).toBeNull();
  });

  it('暂停按钮把操作转给主进程', async () => {
    render(<TimerWidgetApp />);
    await waitFor(() => expect(screen.getByRole('button', { name: '暂停计时' })).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '暂停计时' }));
    expect(sendAction).toHaveBeenCalledWith('pause');
  });

  it('暂停后按钮变成继续', async () => {
    mockApi({ ...timer, running: false, accumulatedMs: 60_000 });
    render(<TimerWidgetApp />);

    const resume = await screen.findByRole('button', { name: '继续计时' });
    fireEvent.click(resume);
    expect(sendAction).toHaveBeenCalledWith('resume');
  });

  it('结束按钮结束计时，点读数回到 Memex', async () => {
    render(<TimerWidgetApp />);
    await waitFor(() => expect(screen.getByRole('button', { name: '结束计时' })).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '结束计时' }));
    expect(sendAction).toHaveBeenCalledWith('stop');

    fireEvent.click(screen.getByRole('button', { name: '回到 Memex' }));
    expect(sendAction).toHaveBeenCalledWith('open');
  });

  it('到点后暂停按钮禁用', async () => {
    mockApi({ ...timer, running: false, finished: true, accumulatedMs: timer.durationMs ?? 0 });
    render(<TimerWidgetApp />);

    const pause = (await screen.findByRole('button', { name: '继续计时' })) as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
  });
});
