export type McpErrorCode = 'ACCESS_DENIED' | 'NOT_FOUND' | 'DB_LOCKED' | 'DB_OUTDATED' | 'INVALID_ARGUMENT';

export class McpToolError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function toErrorPayload(error: unknown): string {
  if (error instanceof McpToolError) {
    return JSON.stringify({ error: { code: error.code, message: error.message } });
  }
  const message = error instanceof Error ? error.message : String(error);
  const locked = /locked|busy/i.test(message);
  return JSON.stringify({ error: { code: locked ? 'DB_LOCKED' : 'INTERNAL', message } });
}
