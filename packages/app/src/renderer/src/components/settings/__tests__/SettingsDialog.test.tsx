import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MemexApi, MemexSettings } from '@memex/shared';
import { SettingsDialog } from '../SettingsDialog';

const updateSettings = vi.hoisted(() => vi.fn());

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: () => ({
    settingsOpen: true,
    setSettingsOpen: vi.fn(),
    settings: {
      mcpAccessMode: 'tasks',
      mcpTaskWrite: false,
      closeToTray: true,
      autoLaunch: false,
      quickCaptureHideOnBlur: true,
      theme: 'system',
      lastBackupAt: 0,
    } satisfies MemexSettings,
    updateSettings,
  }),
}));

beforeEach(() => {
  updateSettings.mockReset();
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

describe('Settings dialog MCP task write', () => {
  it('渲染写入开关并默认关闭', async () => {
    render(<SettingsDialog />);
    const toggle = await screen.findByRole('switch', { name: /允许 AI 修改任务/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('打开开关时写入 mcpTaskWrite', async () => {
    render(<SettingsDialog />);
    fireEvent.click(await screen.findByRole('switch', { name: /允许 AI 修改任务/ }));
    expect(updateSettings).toHaveBeenCalledWith({ mcpTaskWrite: true });
  });
});
