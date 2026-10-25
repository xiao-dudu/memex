import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MemexApi, UpdateState } from '@memex/shared';
import { UpdatePrompt } from '../UpdatePrompt';

const state: UpdateState = {
  phase: 'available',
  currentVersion: '1.3.2',
  latestVersion: '1.4.0',
  releaseUrl: 'https://example.com/release',
  notes: '## 修复\n- 修好了 A\n- 修好了 B',
};

beforeEach(() => {
  window.memex = {
    update: {
      onState: vi.fn(() => () => {}),
      install: vi.fn(),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
});

describe('Update prompt', () => {
  it('渲染版本号与更新内容', () => {
    render(<UpdatePrompt state={state} onDismiss={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByText('v1.4.0')).toBeInTheDocument();
    expect(screen.getByText(/当前版本 v1\.3\.2/)).toBeInTheDocument();
    expect(screen.getByText('修好了 A')).toBeInTheDocument();
    expect(screen.getByText('修复')).toBeInTheDocument();
  });

  it('跳过此版本时回传版本号', () => {
    const onSkip = vi.fn();
    render(<UpdatePrompt state={state} onDismiss={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: '跳过此版本' }));
    expect(onSkip).toHaveBeenCalledWith('1.4.0');
  });

  it('取消时关闭弹窗', () => {
    const onDismiss = vi.fn();
    render(<UpdatePrompt state={state} onDismiss={onDismiss} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('没有更新状态时不渲染', () => {
    render(<UpdatePrompt state={null} onDismiss={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: '发现新版本' })).not.toBeInTheDocument();
  });
});
