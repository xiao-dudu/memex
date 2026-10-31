import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MemexApi } from '@memex/shared';
import App from '../App';
import { useAppStore } from '../store/useAppStore';

let refreshCalls = 0;

beforeEach(() => {
  refreshCalls = 0;
  window.memex = {
    window: { setTheme: vi.fn().mockResolvedValue(undefined) },
    timer: { sync: vi.fn(), onAction: () => () => undefined },
    team: {
      bootstrap: vi.fn().mockResolvedValue({
        session: {
          signedIn: false,
          userId: null,
          email: null,
          displayName: null,
          teamId: null,
          role: null,
        },
        team: null,
        members: [],
        tasks: [],
        notifications: [],
        sync: { phase: 'idle', pendingCount: 0, lastSyncedAt: null, message: null },
      }),
      onSyncState: vi.fn(() => () => undefined),
    },
  } as unknown as MemexApi;
  useAppStore.setState({
    module: 'tasks',
    settings: null,
    tasks: [],
    notes: [],
    activeTask: null,
    activeNote: null,
    bootstrap: async () => undefined,
    refresh: async () => {
      refreshCalls += 1;
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('App 在外部写入后的刷新', () => {
  it('窗口重新获得焦点时补一次读取', () => {
    render(<App />);
    expect(refreshCalls).toBe(0);

    window.dispatchEvent(new Event('focus'));
    expect(refreshCalls).toBe(1);
  });

  it('文档不可见时忽略 focus', () => {
    render(<App />);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    window.dispatchEvent(new Event('focus'));
    expect(refreshCalls).toBe(0);

    visibility.mockRestore();
  });

  it('卸载后不再监听 focus', () => {
    const view = render(<App />);
    view.unmount();

    window.dispatchEvent(new Event('focus'));
    expect(refreshCalls).toBe(0);
  });

  it('团队模块挂载工作区并隐藏个人列表与详情', async () => {
    useAppStore.setState({ module: 'team' });
    const { container } = render(<App />);

    expect(await screen.findByLabelText('团队登录')).toBeInTheDocument();
    expect(container.querySelector('div.hidden')).toBeInTheDocument();
  });

  it('团队模块下 Ctrl+N 不创建个人任务或笔记', async () => {
    const createTask = vi.fn();
    const createNote = vi.fn();
    useAppStore.setState({ module: 'team', createTask, createNote });
    render(<App />);
    await screen.findByLabelText('团队登录');

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });

    expect(createTask).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });
});
