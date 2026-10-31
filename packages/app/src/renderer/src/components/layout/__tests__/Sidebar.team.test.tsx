import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { Sidebar } from '../Sidebar';

beforeEach(() => {
  useAppStore.setState({ module: 'tasks', sidebarCollapsed: false, tags: [], taskCounts: { inbox: 0, today: 0, upcoming: 0, done: 0, trash: 0 }, noteCounts: { all: 0, pinned: 0, trash: 0 } });
});

describe('Sidebar team entry', () => {
  it('switches to the team module', async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: '团队' }));
    expect(useAppStore.getState().module).toBe('team');
  });

  it('switches to the team module from the collapsed sidebar', async () => {
    useAppStore.setState({ sidebarCollapsed: true });
    render(<Sidebar />);

    await userEvent.click(screen.getByRole('button', { name: '团队' }));

    expect(useAppStore.getState().module).toBe('team');
  });

  it('does not render personal note views or tag controls in team mode', () => {
    useAppStore.setState({
      module: 'team',
      tags: [{ id: 'tag-1', name: '工作', color: '#336699', taskCount: 1, noteCount: 1 }],
    });
    render(<Sidebar />);

    expect(screen.queryByRole('button', { name: '全部笔记' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '置顶' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^标签 工作/ })).not.toBeInTheDocument();
    expect(screen.queryByText('视图')).not.toBeInTheDocument();
    expect(screen.queryByText('标签')).not.toBeInTheDocument();
  });
});
