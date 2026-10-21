import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, unlinkSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import http from 'node:http';
import https from 'node:https';

export async function downloadFile(
  url: string,
  destination: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const maxRedirects = 5;

  await new Promise<void>((resolve, reject) => {
    const request = (currentUrl: string, redirects: number) => {
      const parsed = new URL(currentUrl);
      const transport = parsed.protocol === 'http:' ? http : https;
      const req = transport.get(
        parsed,
        {
          headers: {
            'User-Agent': 'Memex-Updater',
            Accept: 'application/octet-stream',
          },
        },
        (response: IncomingMessage) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            if (redirects >= maxRedirects) {
              reject(new Error('下载重定向次数过多'));
              return;
            }
            request(new URL(response.headers.location, currentUrl).toString(), redirects + 1);
            return;
          }
          if (status !== 200) {
            response.resume();
            reject(new Error(`下载失败：HTTP ${status}`));
            return;
          }

          const total = Number(response.headers['content-length'] ?? 0);
          let received = 0;
          const file = createWriteStream(destination);

          response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) onProgress((received / total) * 100);
          });
          response.pipe(file);

          file.on('finish', () => {
            file.close(() => {
              onProgress(100);
              resolve();
            });
          });
          file.on('error', reject);
          response.on('error', reject);
        },
      );
      req.on('error', reject);
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
