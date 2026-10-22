export type AiErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'CONTEXT_LENGTH'
  | 'SERVER'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NETWORK'
  | 'EMPTY_RESPONSE'
  | 'INVALID_RESPONSE';

export class AiRequestError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AiRequestConfig {
  baseUrl: string;
  model: string;
  apiKey?: string | null;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiCompletionResult {
  content: string;
  usage?: AiUsage;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

function invalidConfig(message: string): AiRequestError {
  return new AiRequestError('INVALID_CONFIG', message);
}

export function normalizeChatCompletionsUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw invalidConfig('Base URL 格式无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidConfig('Base URL 只支持 http 或 https');
  }
  if (url.username || url.password) {
    throw invalidConfig('Base URL 不能包含用户名或密码');
  }

  url.search = '';
  url.hash = '';
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/chat/completions') ? pathname : `${pathname}/chat/completions`;
  return url.toString().replace(/\/$/, '');
}

async function readErrorSnippet(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = 8192 - size;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

function isContextLengthText(value: string): boolean {
  return /context_length_exceeded|maximum context length|context window|too many tokens|prompt is too long|maximum.{0,20}tokens/i.test(value);
}

function httpError(status: number, body = ''): AiRequestError {
  if (status === 413 || isContextLengthText(body)) {
    return new AiRequestError('CONTEXT_LENGTH', '发送内容超过模型上下文长度，请减少任务或笔记');
  }
  if (status === 401 || status === 403) return new AiRequestError('AUTH', '鉴权失败，请检查 API Key');
  if (status === 404) return new AiRequestError('NOT_FOUND', '接口路径不存在，请检查 Base URL');
  if (status === 429) return new AiRequestError('RATE_LIMIT', '请求过于频繁或额度不足');
  if (status >= 500) return new AiRequestError('SERVER', `模型服务异常（HTTP ${status}）`);
  return new AiRequestError('INVALID_RESPONSE', `模型服务请求失败（HTTP ${status}）`);
}

function normalizeContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];
    const text = (part as { text?: unknown }).text;
    return typeof text === 'string' ? [text] : [];
  });
  return parts.length > 0 ? parts.join('') : null;
}

function cleanMarkdownContent(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```[^\r\n]*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapUsage(usage: ChatCompletionPayload['usage']): AiUsage | undefined {
  if (!usage) return undefined;
  const result: AiUsage = {};
  const promptTokens = numberOrUndefined(usage.prompt_tokens);
  const completionTokens = numberOrUndefined(usage.completion_tokens);
  const totalTokens = numberOrUndefined(usage.total_tokens);
  if (promptTokens !== undefined) result.promptTokens = promptTokens;
  if (completionTokens !== undefined) result.completionTokens = completionTokens;
  if (totalTokens !== undefined) result.totalTokens = totalTokens;
  return Object.keys(result).length > 0 ? result : undefined;
}

export async function requestChatCompletion(
  config: AiRequestConfig,
  messages: ChatMessage[],
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<AiCompletionResult> {
  if (!config.model.trim()) throw invalidConfig('模型名称不能为空');
  if (messages.length === 0) throw invalidConfig('消息不能为空');
  const timeoutMs = config.timeoutMs ?? 90_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw invalidConfig('超时时间无效');

  const url = normalizeChatCompletionsUrl(config.baseUrl);
  const controller = new AbortController();
  let abortReason: 'timeout' | 'caller' | null = null;

  if (signal?.aborted) throw new AiRequestError('CANCELLED', '已取消生成');
  const onCallerAbort = (): void => {
    abortReason = 'caller';
    controller.abort();
  };
  signal?.addEventListener('abort', onCallerAbort, { once: true });

  const abortPromise = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const timer = setTimeout(() => {
    abortReason = 'timeout';
    controller.abort();
  }, timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const body = JSON.stringify({
    model: config.model,
    messages,
    stream: false,
    temperature: config.temperature ?? 0.3,
    max_tokens: config.maxTokens ?? 4096,
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      }),
      abortPromise,
    ]);
    if (!response.ok) {
      const snippet = await readErrorSnippet(response).catch(() => '');
      throw httpError(response.status, snippet);
    }

    let payload: ChatCompletionPayload;
    try {
      payload = (await Promise.race([response.json(), abortPromise])) as ChatCompletionPayload;
    } catch (error) {
      if (error instanceof AiRequestError) throw error;
      if (abortReason === 'timeout') throw new AiRequestError('TIMEOUT', '模型请求超时');
      if (abortReason === 'caller') throw new AiRequestError('CANCELLED', '已取消生成');
      throw new AiRequestError('INVALID_RESPONSE', '模型返回了无效的 JSON');
    }

    const content = normalizeContent(payload.choices?.[0]?.message?.content);
    if (content === null) throw new AiRequestError('INVALID_RESPONSE', '模型返回内容格式无效');
    const cleaned = cleanMarkdownContent(content);
    if (!cleaned) throw new AiRequestError('EMPTY_RESPONSE', '模型返回内容为空');

    return { content: cleaned, usage: mapUsage(payload.usage) };
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    if (abortReason === 'timeout') throw new AiRequestError('TIMEOUT', '模型请求超时');
    if (abortReason === 'caller' || signal?.aborted) throw new AiRequestError('CANCELLED', '已取消生成');
    throw new AiRequestError('NETWORK', '无法连接模型服务');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

export async function testAiConnection(
  config: AiRequestConfig,
  fetchImpl: FetchLike = fetch,
): Promise<{ latencyMs: number }> {
  const startedAt = Date.now();
  await requestChatCompletion(
    { ...config, temperature: 0, maxTokens: 1 },
    [{ role: 'user', content: 'Reply with OK.' }],
    fetchImpl,
  );
  return { latencyMs: Date.now() - startedAt };
}
