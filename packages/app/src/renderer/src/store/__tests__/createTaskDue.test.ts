import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemexApi, Task } from '@memex/shared';
import { useAppStore } from '../useAppStore';

const create = vi.fn(async (input: { title: string; dueAt?: number | null }) =>
  ({ id: 'task-1', title: input.title, dueAt: input.dueAt ?? null, tags: [] }) as unknown as Task,
);

beforeEach(() => {
  create.mockClear();
  window.memex = { tasks: { create } } as unknown as MemexApi;
  useAppStore.setState({ tasks: [], activeTask: null, refresh: async () => undefined });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('快速创建任务的默认截止时间', () => {
  it('不传截止时间时落到当天 23:59', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 9, 38));

    const task = await useAppStore.getState().createTask('写周报');

    const expected = new Date(2026, 9, 30, 23, 59, 0, 0).getTime();
    expect(create).toHaveBeenCalledWith({ title: '写周报', dueAt: expected });
    expect(task.dueAt).toBe(expected);
  });

  it('显式传 null 时不设截止时间', async () => {
    await useAppStore.getState().createTask('随手记', null);
    expect(create).toHaveBeenCalledWith({ title: '随手记', dueAt: null });
  });
});
