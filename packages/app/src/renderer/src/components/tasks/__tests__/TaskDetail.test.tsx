import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@memex/shared';
import { TaskDetail } from '../TaskDetail';
import { useAppStore } from '../../../store/useAppStore';

const STORAGE_KEY = 'memex:task-properties-collapsed';

const task: Task = {
  id: 'task-1',
  title: '项目计划评审',
  description: '确认范围',
  status: 'todo',
  priority: 'medium',
  dueAt: null,
  noteId: null,
  noteTitle: null,
  noteInTrash: false,
  createdAt: Date.UTC(2026, 9, 20),
  updatedAt: Date.UTC(2026, 9, 20),
  completedAt: null,
  deletedAt: null,
  tags: ['工作'],
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    activeTask: task,
    notes: [],
    updateTask: async () => undefined,
    deleteTask: async () => undefined,
    restoreTask: async () => undefined,
    purgeTask: async () => undefined,
    setListCollapsed: () => undefined,
  });
});

afterEach(() => {
  cleanup();
});

describe('task properties panel', () => {
  it('collapses task properties by default and expands on demand', () => {
    render(<TaskDetail />);

    expect(screen.queryByRole('button', { name: '进行中' })).toBeNull();
    expect(screen.getByText('待办 · 中 · 工作')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开任务属性' }));

    expect(screen.getByRole('button', { name: '进行中' })).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('restores a persisted expanded state', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    render(<TaskDetail />);

    expect(screen.getByRole('button', { name: '进行中' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '收起任务属性' })).not.toBeNull();
  });
});
