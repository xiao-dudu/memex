// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  AiRequestError,
  normalizeChatCompletionsUrl,
  requestChatCompletion,
  testAiConnection,
  type FetchLike,
} from '../ai-client';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('normalizeChatCompletionsUrl', () => {
  it('normalizes base URLs and preserves an existing completions path', () => {
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(normalizeChatCompletionsUrl('http://localhost:1234/v1/chat/completions/')).toBe(
      'http://localhost:1234/v1/chat/completions',
    );
    expect(normalizeChatCompletionsUrl('https://api.example.com?key=value#fragment')).toBe(
      'https://api.example.com/chat/completions',
    );
  });

  it('rejects unsupported protocols and embedded credentials', () => {
    expect(() => normalizeChatCompletionsUrl('file:///tmp/model')).toThrow(AiRequestError);
    expect(() => normalizeChatCompletionsUrl('ftp://example.com/v1')).toThrow(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );
    expect(() => normalizeChatCompletionsUrl('https://user:pass@example.com/v1')).toThrow(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );
  });
});

describe('requestChatCompletion', () => {
  it('sends the expected non-streaming request and authorization header', async () => {
    let capturedUrl = '';
    let captured: RequestInit | undefined;
    const fetchImpl: FetchLike = async (url, init) => {
      capturedUrl = String(url);
      captured = init;
      return jsonResponse({
        choices: [{ message: { content: '# 周报' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    };

    const result = await requestChatCompletion(
      {
        baseUrl: 'https://api.example.com/v1/',
        apiKey: 'secret',
        model: 'm1',
        timeoutMs: 900,
      },
      [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'data' },
      ],
      fetchImpl,
    );

    expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions');
    expect(new Headers(captured?.headers).get('Authorization')).toBe('Bearer secret');
    expect(new Headers(captured?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(captured?.body))).toEqual({
      model: 'm1',
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'data' },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 4096,
    });
    expect(result).toEqual({
      content: '# 周报',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
  });

  it('omits auth for local services and accepts text content parts', async () => {
    let headers: Headers | undefined;
    const result = await requestChatCompletion(
      { baseUrl: 'http://localhost:1234/v1', model: 'local', timeoutMs: 900 },
      [{ role: 'user', content: 'x' }],
      async (_url, init) => {
        headers = new Headers(init?.headers);
        return jsonResponse({
          choices: [{ message: { content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] } }],
        });
      },
    );

    expect(headers?.has('Authorization')).toBe(false);
    expect(result.content).toBe('第一段第二段');
  });

  it('removes exactly one outer Markdown fence without rewriting content', async () => {
    const body = '```markdown\n# 本周完成\n\n- 结果\n```';
    const result = await requestChatCompletion(
      { baseUrl: 'https://api.example.com/v1', model: 'm1', timeoutMs: 900 },
      [{ role: 'user', content: 'x' }],
      async () => jsonResponse({ choices: [{ message: { content: body } }] }),
    );
    expect(result.content).toBe('# 本周完成\n\n- 结果');
  });

  it.each([
    [401, 'AUTH'],
    [403, 'AUTH'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMIT'],
    [500, 'SERVER'],
  ] as const)('maps HTTP %s to a stable error code', async (status, code) => {
    await expect(
      requestChatCompletion(
        { baseUrl: 'https://api.example.com/v1', model: 'm1', timeoutMs: 900 },
        [{ role: 'user', content: 'x' }],
        async () => new Response('failure', { status }),
      ),
    ).rejects.toMatchObject({ code });
  });

  it('rejects empty, malformed and unsuccessful response bodies', async () => {
    const config = { baseUrl: 'https://api.example.com/v1', model: 'm1', timeoutMs: 900 };
    const messages = [{ role: 'user' as const, content: 'x' }];

    await expect(
      requestChatCompletion(config, messages, async () => jsonResponse({ choices: [{ message: { content: '   ' } }] })),
    ).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
    await expect(
      requestChatCompletion(config, messages, async () => new Response('not json', { status: 200 })),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      requestChatCompletion(config, messages, async () => jsonResponse({ choices: [] })),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      requestChatCompletion(config, messages, async () => new Response('bad request', { status: 400 })),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('maps network failures, timeouts and caller cancellation', async () => {
    const config = { baseUrl: 'https://api.example.com/v1', model: 'm1', timeoutMs: 20 };
    const messages = [{ role: 'user' as const, content: 'x' }];

    await expect(
      requestChatCompletion(config, messages, async () => {
        throw new Error('offline');
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' });

    await expect(
      requestChatCompletion(
        config,
        messages,
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    const controller = new AbortController();
    const pending = requestChatCompletion(
      config,
      messages,
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('testAiConnection', () => {
  it('uses a one-token request and reports latency without persisting anything', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { max_tokens: number; stream: boolean };
      expect(body.max_tokens).toBe(1);
      expect(body.stream).toBe(false);
      return jsonResponse({ choices: [{ message: { content: 'OK' } }] });
    });

    const result = await testAiConnection(
      { baseUrl: 'https://api.example.com/v1', model: 'm1', apiKey: 'secret', timeoutMs: 900 },
      fetchImpl,
    );
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
