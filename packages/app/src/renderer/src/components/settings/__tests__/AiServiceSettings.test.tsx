import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AiServiceConfig, MemexApi } from '@memex/shared';
import { AiServiceSettings } from '../AiServiceSettings';

const emptyConfig: AiServiceConfig = { baseUrl: '', model: '', hasApiKey: false, timeoutMs: 90_000, revision: 'revision-1' };
const savedConfig: AiServiceConfig = {
  baseUrl: 'https://api.example.com/v1',
  model: 'm1',
  hasApiKey: true,
  timeoutMs: 90_000,
  revision: 'revision-1',
};

beforeEach(() => {
  window.memex = {
    ai: {
      getConfig: vi.fn().mockResolvedValue(emptyConfig),
      updateConfig: vi.fn().mockResolvedValue(savedConfig),
      testConnection: vi.fn().mockResolvedValue({ ok: true, latencyMs: 42 }),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
});

describe('AI service settings', () => {
  it('saves base URL, model and key', async () => {
    render(<AiServiceSettings />);
    fireEvent.change(await screen.findByLabelText('Base URL'), { target: { value: 'https://api.example.com/v1' } });
    fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('超时时间（秒）'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() =>
      expect(window.memex.ai.updateConfig).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com/v1',
        model: 'm1',
        apiKey: 'secret',
        timeoutMs: 30_000,
      }),
    );
    expect(screen.queryByDisplayValue('secret')).toBeNull();
  });

  it('tests the current draft without saving it', async () => {
    window.memex.ai.getConfig = vi.fn().mockResolvedValue(savedConfig);
    render(<AiServiceSettings />);
    fireEvent.change(await screen.findByLabelText('模型'), { target: { value: 'draft-model' } });
    fireEvent.change(screen.getByLabelText('超时时间（秒）'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() =>
      expect(window.memex.ai.testConnection).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'draft-model', timeoutMs: 45_000 }),
      ),
    );
    expect(await screen.findByText(/连接成功，耗时 42 ms/)).not.toBeNull();
    expect(window.memex.ai.updateConfig).not.toHaveBeenCalled();
  });

  it('clears the key after confirmation', async () => {
    window.memex.ai.getConfig = vi.fn().mockResolvedValue(savedConfig);
    window.memex.ai.updateConfig = vi.fn().mockResolvedValue({ ...savedConfig, hasApiKey: false });
    render(<AiServiceSettings />);

    fireEvent.click(await screen.findByRole('button', { name: '清除 Key' }));
    expect(screen.getByRole('button', { name: '确认清除' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认清除' }));

    await waitFor(() => expect(window.memex.ai.updateConfig).toHaveBeenCalledWith({ clearApiKey: true }));
  });
});
