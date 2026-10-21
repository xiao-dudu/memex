import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadFile, hashFile, removeFile } from '../update-io';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not start');
  return address.port;
}

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'memex-update-')), 'setup.exe');
}

describe('update IO', () => {
  it('follows redirects, reports progress and hashes the file', async () => {
    const payload = Buffer.from('memex installer payload');
    const server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/installer' });
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(payload.length),
      });
      response.end(payload);
    });
    const port = await listen(server);

    const destination = tempFile();
    const progress: number[] = [];
    await downloadFile(`http://127.0.0.1:${port}/redirect`, destination, (percent) => progress.push(percent));

    expect(readFileSync(destination)).toEqual(payload);
    expect(progress).toContain(100);

    const hash = await hashFile(destination);
    expect(hash).toBe('kPWltPlp3ldz8EKhmGIc7b5iTcUPiydH7Pw6ETbIr4PCRbe2qcGzxXeDxylW86NG0OO99Mr49CMZHS/CjMnLzg==');

    removeFile(destination);
    expect(() => readFileSync(destination)).toThrow();
  });

  it('resumes from the partial file after the connection resets', async () => {
    const payload = Buffer.from('x'.repeat(4096));
    let connections = 0;
    const server = createServer((request, response) => {
      connections += 1;
      const range = request.headers.range;
      if (connections === 1) {
        // Announce the full size, send a prefix, then drop the connection.
        response.writeHead(200, { 'Content-Length': String(payload.length) });
        response.write(payload.subarray(0, 1024));
        setTimeout(() => response.destroy(), 20);
        return;
      }
      const start = range ? Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) : 0;
      response.writeHead(start > 0 ? 206 : 200, {
        'Content-Length': String(payload.length - start),
        'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
        'Accept-Ranges': 'bytes',
      });
      response.end(payload.subarray(start));
    });
    const port = await listen(server);

    const destination = tempFile();
    const progress: number[] = [];
    await downloadFile(`http://127.0.0.1:${port}/installer`, destination, (percent) => progress.push(percent), {
      maxAttempts: 3,
      retryDelayMs: 10,
    });

    expect(connections).toBeGreaterThanOrEqual(2);
    expect(readFileSync(destination)).toEqual(payload);
    expect(progress.at(-1)).toBe(100);
  });

  it('restarts from scratch when the server ignores the range header', async () => {
    const payload = Buffer.from('y'.repeat(2048));
    let connections = 0;
    const server = createServer((request, response) => {
      connections += 1;
      if (connections === 1) {
        response.writeHead(200, { 'Content-Length': String(payload.length) });
        response.write(payload.subarray(0, 512));
        setTimeout(() => response.destroy(), 20);
        return;
      }
      // Deliberately ignores Range and returns the whole body.
      response.writeHead(200, { 'Content-Length': String(payload.length) });
      response.end(payload);
    });
    const port = await listen(server);

    const destination = tempFile();
    await downloadFile(`http://127.0.0.1:${port}/installer`, destination, () => undefined, {
      maxAttempts: 3,
      retryDelayMs: 10,
    });

    expect(readFileSync(destination)).toEqual(payload);
  });

  it('resumes a partial file left by an earlier failed download', async () => {
    const payload = Buffer.from('r'.repeat(8192));
    const ranges: (string | undefined)[] = [];
    const server = createServer((request, response) => {
      ranges.push(request.headers.range);
      const start = request.headers.range
        ? Number(/bytes=(\d+)-/.exec(request.headers.range)?.[1] ?? 0)
        : 0;
      response.writeHead(start > 0 ? 206 : 200, {
        'Content-Length': String(payload.length - start),
        'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
        'Accept-Ranges': 'bytes',
      });
      response.end(payload.subarray(start));
    });
    const port = await listen(server);

    const destination = tempFile();
    writeFileSync(destination, payload.subarray(0, 3000));
    await downloadFile(`http://127.0.0.1:${port}/installer`, destination, () => undefined, {
      maxAttempts: 1,
    });

    expect(ranges[0]).toBe('bytes=3000-');
    expect(readFileSync(destination)).toEqual(payload);
  });

  it('accepts an already complete partial file when the server replies 416', async () => {
    const payload = Buffer.from('c'.repeat(1024));
    const server = createServer((_request, response) => {
      response.writeHead(416);
      response.end();
    });
    const port = await listen(server);

    const destination = tempFile();
    writeFileSync(destination, payload);

    await downloadFile(`http://127.0.0.1:${port}/installer`, destination, () => undefined, {
      maxAttempts: 1,
    });

    expect(readFileSync(destination)).toEqual(payload);
  });

  it('fails after exhausting retry attempts and keeps the partial file for resume', async () => {
    const payload = Buffer.from('z'.repeat(1024));
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Length': String(payload.length) });
      response.write(payload.subarray(0, 128));
      setTimeout(() => response.destroy(), 10);
    });
    const port = await listen(server);

    const destination = tempFile();
    await expect(
      downloadFile(`http://127.0.0.1:${port}/installer`, destination, () => undefined, {
        maxAttempts: 3,
        retryDelayMs: 10,
      }),
    ).rejects.toThrow();

    expect(existsSync(destination)).toBe(true);
    expect(statSync(destination).size).toBeGreaterThan(0);
  });
});
