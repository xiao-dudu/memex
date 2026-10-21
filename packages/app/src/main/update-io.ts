import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, statSync, unlinkSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import http from 'node:http';
import https from 'node:https';

export interface DownloadOptions {
  /** Total attempts including the first one. */
  maxAttempts?: number;
  retryDelayMs?: number;
}

const MAX_REDIRECTS = 5;

/**
 * The environment's global agent reuses keep-alive sockets with a 5s timeout,
 * which silently kills long GitHub downloads (surfacing as ECONNRESET). Large
 * installer downloads need a dedicated, non-reusing agent.
 */
const httpAgent = new http.Agent({ keepAlive: false, timeout: 0 });
const httpsAgent = new https.Agent({ keepAlive: false, timeout: 0 });

export class RetryableDownloadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableDownloadError';
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableDownloadError) return true;
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|aborted|premature|closed/i.test(
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

/**
 * Downloads to `destination`, resuming from a partial file when the server
 * supports Range requests. GitHub release downloads go through a redirect to
 * objects.githubusercontent.com and can drop mid-transfer; retrying without a
 * Range header would restart a ~95 MB download every time.
 */
export async function downloadFile(
  url: string,
  destination: string,
  onProgress: (percent: number) => void,
  options: DownloadOptions = {},
): Promise<void> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 800);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await downloadAttempt(url, destination, onProgress);
      onProgress(100);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  // Keep the partial file: the next attempt resumes from it via Range.
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function downloadAttempt(
  url: string,
  destination: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const offset = fileSize(destination);

    const request = (currentUrl: string, redirects: number) => {
      const parsed = new URL(currentUrl);
      const transport = parsed.protocol === 'http:' ? http : https;
      const headers: Record<string, string> = {
        'User-Agent': 'Memex-Updater',
        Accept: 'application/octet-stream',
        'Accept-Encoding': 'identity',
      };
      if (offset > 0) headers.Range = `bytes=${offset}-`;

      const req = transport.get(parsed, { headers, agent: parsed.protocol === 'http:' ? httpAgent : httpsAgent }, (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('下载重定向次数过多'));
            return;
          }
          request(new URL(response.headers.location, currentUrl).toString(), redirects + 1);
          return;
        }

        // 416 means our offset is already at or past the end. If the file
        // length matches, hash verification decides whether it is usable.
        if (status === 416 && offset > 0) {
          response.resume();
          resolve();
          return;
        }

        // 206 means the server honored our Range request. A 200 means it
        // ignored it, so the download must restart from byte zero.
        const resuming = offset > 0 && status === 206;
        if (status !== 200 && status !== 206) {
          response.resume();
          reject(new Error(`下载失败：HTTP ${status}`));
          return;
        }

        const contentLength = Number(response.headers['content-length'] ?? 0);
        const total = resuming ? offset + contentLength : contentLength;
        let received = resuming ? offset : 0;

        if (!resuming && offset > 0) {
          // Server ignored Range: truncate before writing the new body.
          try {
            unlinkSync(destination);
          } catch {
            // Nothing to remove.
          }
        }

        const file = createWriteStream(destination, { flags: resuming ? 'a' : 'w' });
        let settled = false;

        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          file.destroy();
          reject(error);
        };

        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (!file.write(chunk)) {
            response.pause();
            file.once('drain', () => response.resume());
          }
          if (total > 0) onProgress((received / total) * 100);
        });

        response.on('aborted', () => fail(new RetryableDownloadError('下载连接被中断')));
        response.on('error', (error) => fail(new RetryableDownloadError('下载连接出错', error)));
        response.on('end', () => {
          if (settled) return;
          if (total > 0 && received < total) {
            fail(new RetryableDownloadError(`下载中断：已接收 ${received}/${total} 字节`));
            return;
          }
          settled = true;
          file.end(() => resolve());
        });

        file.on('error', (error) => fail(error));
      });

      req.on('error', (error) => reject(new RetryableDownloadError('下载连接失败', error)));
      req.setTimeout(120_000, () => {
        req.destroy(new RetryableDownloadError('下载超时'));
      });
    };

    request(url, 0);
  });
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
  try {
    unlinkSync(path);
  } catch {
    // The partial file may not exist if the download failed immediately.
  }
}
