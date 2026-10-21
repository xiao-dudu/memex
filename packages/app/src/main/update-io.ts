import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';

export interface DownloadOptions {
  /** Total attempts including the first one. */
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Abort when no data arrives for this long. */
  inactivityTimeoutMs?: number;
  /**
   * Fetch implementation used for the transfer. The app passes Electron's
   * net.fetch so system proxy / PAC / VPN settings are honored; tests pass a
   * stub.
   */
  fetchImpl?: typeof fetch;
}

export class RetryableDownloadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableDownloadError';
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableDownloadError) return true;
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|aborted|premature|terminated|closed|fetch failed|network/i.test(
    `${error.name} ${error.message}`,
  );
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Nothing to remove.
  }
}

/** Flushes buffered chunks so a failed attempt still leaves resumable data. */
function closeStream(file: WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (file.closed) {
      resolve();
      return;
    }
    file.once('close', () => resolve());
    file.once('error', () => resolve());
    file.end();
  });
}

function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  controller: AbortController,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RetryableDownloadError('下载超时：长时间没有收到数据'));
      controller.abort();
    }, timeoutMs);
  });

  return Promise.race([reader.read(), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Downloads to `destination`, resuming from a partial file when the server
 * honors Range requests. Connections can drop mid-transfer, and restarting a
 * ~95 MB download on every retry is wasteful, so partial bytes are kept on
 * disk and reused by the next attempt (and by a later click on "update").
 */
export async function downloadFile(
  url: string,
  destination: string,
  onProgress: (percent: number) => void,
  options: DownloadOptions = {},
): Promise<void> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 800);
  const inactivityTimeoutMs = Math.max(1, options.inactivityTimeoutMs ?? 60_000);
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await downloadAttempt(url, destination, onProgress, fetchImpl, inactivityTimeoutMs);
      onProgress(100);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function downloadAttempt(
  url: string,
  destination: string,
  onProgress: (percent: number) => void,
  fetchImpl: typeof fetch,
  inactivityTimeoutMs: number,
): Promise<void> {
  const offset = fileSize(destination);
  const headers: Record<string, string> = {
    'User-Agent': 'Memex-Updater',
    Accept: 'application/octet-stream',
  };
  if (offset > 0) headers.Range = `bytes=${offset}-`;

  const controller = new AbortController();
  let response: Response;
  try {
    response = await fetchImpl(url, { headers, redirect: 'follow', signal: controller.signal });
  } catch (error) {
    throw new RetryableDownloadError('下载连接失败', error);
  }

  // 416 means our offset is already at (or past) the end. The checksum check
  // afterwards decides whether the existing file is actually usable.
  if (response.status === 416 && offset > 0) {
    await response.body?.cancel();
    return;
  }

  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel();
    throw new Error(`下载失败：HTTP ${response.status}`);
  }

  const resuming = offset > 0 && response.status === 206;
  if (!resuming && offset > 0) removeQuietly(destination);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  const total = resuming ? offset + contentLength : contentLength;
  let received = resuming ? offset : 0;

  if (!response.body) {
    throw new RetryableDownloadError('下载响应为空');
  }

  const file = createWriteStream(destination, { flags: resuming ? 'a' : 'w' });
  const reader = response.body.getReader();
  let failure: Error | null = null;

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await readWithTimeout(reader, inactivityTimeoutMs, controller);
      } catch (error) {
        if (error instanceof RetryableDownloadError) throw error;
        if (controller.signal.aborted) {
          throw new RetryableDownloadError('下载超时：长时间没有收到数据', error);
        }
        throw new RetryableDownloadError('下载连接被中断', error);
      }
      if (chunk.done) break;

      received += chunk.value.byteLength;
      if (total > 0) onProgress((received / total) * 100);

      if (!file.write(Buffer.from(chunk.value))) {
        await once(file, 'drain');
      }
    }

    if (total > 0 && received < total) {
      throw new RetryableDownloadError(`下载中断：已接收 ${received}/${total} 字节`);
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be errored.
    }
  }

  await closeStream(file);
  if (failure) throw failure;
}

export async function hashFile(path: string, algorithm: 'sha512' | 'sha256' = 'sha512'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('base64')));
  });
}

export function removeFile(path: string): void {
  removeQuietly(path);
}

/**
 * Removes installers left in the temp directory by previous updates. A running
 * installer cannot be deleted, so cleanup happens on the next app start.
 */
export function cleanupOldInstallers(
  tempDir: string,
  now: number = Date.now(),
  maxAgeMs: number = 24 * 60 * 60 * 1000,
  mtime: (path: string) => number = (path) => statSync(path).mtimeMs,
): string[] {
  if (!existsSync(tempDir)) return [];

  const removed: string[] = [];
  for (const name of readdirSync(tempDir)) {
    if (!name.startsWith('memex-update-')) continue;
    const path = join(tempDir, name);
    try {
      if (now - mtime(path) < maxAgeMs) continue;
      unlinkSync(path);
      removed.push(path);
    } catch {
      // Locked by a running installer or already gone; try again next launch.
    }
  }
  return removed;
}
