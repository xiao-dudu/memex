import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MemexApi, MemexSettings } from '@memex/shared';
import { SettingsDialog } from '../SettingsDialog';

const updateSettings = vi.hoisted(() => vi.fn());

// 设置对象用可变引用：测试需要模拟「任务 + 笔记」模式，静态 mock 改不动。
const storeState = vi.hoisted(() => ({
  settings: {
    mcpAccessMode: 'tasks',
    mcpTaskWrite: false,
    mcpNoteWrite: false,
    closeToTray: true,
    autoLaunch: false,
    quickCaptureHideOnBlur: true,
    theme: 'system',
    lastBackupAt: 0,
  } as MemexSettings,
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: () => ({
    settingsOpen: true,
    setSettingsOpen: vi.fn(),
    settings: storeState.settings,
    updateSettings,
  }),
}));

beforeEach(() => {
  updateSettings.mockReset();
  storeState.settings = {
    mcpAccessMode: 'tasks',
    mcpTaskWrite: false,
    mcpNoteWrite: false,
    closeToTray: true,
    autoLaunch: false,
    quickCaptureHideOnBlur: true,
    theme: 'system',
    lastBackupAt: 0,
  };
  window.memex = {
    ai: {
      getConfig: vi.fn().mockResolvedValue({ baseUrl: '', model: '', hasApiKey: false, timeoutMs: 90_000, revision: 'revision-1' }),
      updateConfig: vi.fn(),
      testConnection: vi.fn(),
    },
    app: {
      info: vi.fn().mockResolvedValue({ version: '1.2.1', dbPath: 'C:/memex/db.sqlite', userDataPath: 'C:/memex' }),
      copyMcpConfig: vi.fn().mockResolvedValue(true),
      backupNow: vi.fn().mockResolvedValue('C:/memex/backup.zip'),
      exportJson: vi.fn().mockResolvedValue('C:/memex/export.json'),
    },
    update: {
      check: vi.fn(),
      install: vi.fn(),
      getState: vi.fn().mockResolvedValue(null),
      onState: vi.fn(() => () => {}),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
});

async function openAiAccess() {
  render(<SettingsDialog />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 访问权限' }));
}

describe('Settings dialog MCP task write', () => {
  it('渲染写入开关并默认关闭', async () => {
    await openAiAccess();
    const toggle = await screen.findByRole('switch', { name: /允许 AI 修改任务/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('打开开关时写入 mcpTaskWrite', async () => {
    await openAiAccess();
    fireEvent.click(await screen.findByRole('switch', { name: /允许 AI 修改任务/ }));
    expect(updateSettings).toHaveBeenCalledWith({ mcpTaskWrite: true });
  });
});

describe('Settings dialog MCP note write', () => {
  it('仅在「任务 + 笔记」模式下显示新建笔记开关', async () => {
    await openAiAccess();
    expect(screen.queryByRole('switch', { name: /允许 AI 新建笔记/ })).toBeNull();

    cleanup();
    storeState.settings = { ...storeState.settings, mcpAccessMode: 'all' };
    await openAiAccess();
    const toggle = await screen.findByRole('switch', { name: /允许 AI 新建笔记/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('打开开关时写入 mcpNoteWrite', async () => {
    storeState.settings = { ...storeState.settings, mcpAccessMode: 'all' };
    await openAiAccess();
    fireEvent.click(await screen.findByRole('switch', { name: /允许 AI 新建笔记/ }));
    expect(updateSettings).toHaveBeenCalledWith({ mcpNoteWrite: true });
  });
});
