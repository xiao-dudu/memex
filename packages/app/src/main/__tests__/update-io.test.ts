import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadFile, hashFile, removeFile } from '../update-io';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

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
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not start');

    const destination = join(mkdtempSync(join(tmpdir(), 'memex-update-')), 'setup.exe');
    const progress: number[] = [];
    await downloadFile(`http://127.0.0.1:${address.port}/redirect`, destination, (percent) => progress.push(percent));

    expect(readFileSync(destination)).toEqual(payload);
    expect(progress).toContain(100);

    const hash = await hashFile(destination);
    expect(hash).toBe('kPWltPlp3ldz8EKhmGIc7b5iTcUPiydH7Pw6ETbIr4PCRbe2qcGzxXeDxylW86NG0OO99Mr49CMZHS/CjMnLzg==');

    removeFile(destination);
    expect(() => readFileSync(destination)).toThrow();
  });
});
