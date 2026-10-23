import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { MemexApi } from '@memex/shared';
import App from '../App';
import { useAppStore } from '../store/useAppStore';

let refreshCalls = 0;

beforeEach(() => {
  refreshCalls = 0;
  window.memex = {
    window: { setTheme: vi.fn().mockResolvedValue(undefined) },
  } as unknown as MemexApi;
  useAppStore.setState({
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
});
