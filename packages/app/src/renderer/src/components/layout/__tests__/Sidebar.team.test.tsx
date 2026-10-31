import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { Sidebar } from '../Sidebar';

beforeEach(() => {
  useAppStore.setState({ module: 'tasks', sidebarCollapsed: false, taskCounts: { inbox: 0, today: 0, upcoming: 0, done: 0, trash: 0 }, noteCounts: { all: 0, pinned: 0, trash: 0 } });
});

describe('Sidebar team entry', () => {
  it('switches to the team module', async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: '团队' }));
    expect(useAppStore.getState().module).toBe('team');
  });
});