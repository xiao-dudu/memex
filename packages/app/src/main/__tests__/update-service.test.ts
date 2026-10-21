import { describe, expect, it, vi } from 'vitest';
import {
  UpdateService,
  compareVersions,
  parseDigest,
  parseLatestMetadata,
  type ChecksumAlgorithm,
  type UpdateAdapter,
  type UpdateRelease,
  type UpdateState,
} from '../update-service';

const SHA512 = 'sha512-value';
const SHA256 = 'a'.repeat(64);
const INSTALLER = 'Memex Setup 1.1.0.exe';
const METADATA = `version: 1.1.0
files:
  - url: ${INSTALLER}
    sha512: ${SHA512}
    size: 100
path: ${INSTALLER}
sha512: ${SHA512}
releaseDate: '2026-10-20T08:00:00.000Z'
`;

function release(overrides: Partial<UpdateRelease> = {}): UpdateRelease {
  return {
    tag: 'v1.1.0',
    name: 'Memex v1.1.0',
    body: '新增一键更新',
    htmlUrl: 'https://github.com/xiao-dudu/memex/releases/tag/v1.1.0',
    assets: [
      { name: 'latest.yml', downloadUrl: 'https://github.com/xiao-dudu/memex/releases/download/v1.1.0/latest.yml' },
      {
        name: INSTALLER,
        downloadUrl: 'https://github.com/xiao-dudu/memex/releases/download/v1.1.0/Memex.Setup.1.1.0.exe',
        digest: `sha256:${SHA256}`,
        size: 100,
      },
    ],
    ...overrides,
  };
}

function adapter(overrides: Partial<UpdateAdapter> = {}): UpdateAdapter & {
  downloaded: { url: string; destination: string }[];
  installed: string[];
  quit: number;
  hashes: string[];
} {
  const fake = {
    downloaded: [] as { url: string; destination: string }[],
    installed: [] as string[],
    quit: 0,
    hashes: [] as string[],
    fetchText: async () => METADATA,
    async downloadFile(url: string, destination: string, onProgress: (percent: number) => void) {
      fake.downloaded.push({ url, destination });
      onProgress(50);
      onProgress(100);
    },
    runInstaller(path: string) {
      fake.installed.push(path);
    },
    quitApp() {
      fake.quit += 1;
    },
    ...overrides,
  };
  return fake;
}

function build(overrides: {
  currentVersion?: string;
  latest?: UpdateRelease | null;
  adapter?: UpdateAdapter;
  hash?: string;
  hashAlgorithm?: ChecksumAlgorithm;
  removeFile?: (path: string) => void;
  output?: (state: UpdateState) => void;
  delayMs?: number;
}) {
  const fake = overrides.adapter ?? adapter();
  return new UpdateService({
    currentVersion: () => overrides.currentVersion ?? '1.0.1',
    fetchLatestRelease: async () => (overrides.latest === undefined ? release() : overrides.latest),
    fetchText: (url) => fake.fetchText(url),
    downloadFile: (url, destination, onProgress) => fake.downloadFile(url, destination, onProgress),
    runInstaller: (path) => fake.runInstaller(path),
    quitApp: () => fake.quitApp(),
    hashFile: async (_path, algorithm) => {
      if (overrides.hashAlgorithm) expect(algorithm).toBe(overrides.hashAlgorithm);
      return overrides.hash ?? SHA512;
    },
    removeFile: overrides.removeFile ?? (() => undefined),
    tempPath: (name) => `C:/temp/${name}`,
    onState: overrides.output ?? (() => undefined),
    installDelayMs: overrides.delayMs ?? 1000,
  });
}

describe('compareVersions', () => {
  it('orders dotted versions numerically', () => {
    expect(compareVersions('1.1.0', '1.0.1')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
});

describe('parseLatestMetadata', () => {
  it('reads version, installer path and sha512', () => {
    expect(parseLatestMetadata(METADATA)).toEqual({ version: '1.1.0', path: INSTALLER, sha512: SHA512 });
  });

  it('rejects metadata without required fields', () => {
    expect(() => parseLatestMetadata('version: 1.1.0')).toThrow('latest.yml');
  });
});

describe('parseDigest', () => {
  it('accepts GitHub sha256 and sha512 digests', () => {
    expect(parseDigest(`sha256:${SHA256}`)).toEqual({ algorithm: 'sha256', value: Buffer.from(SHA256, 'hex').toString('base64') });
    expect(parseDigest('md5:abc')).toBeNull();
    expect(parseDigest(null)).toBeNull();
  });
});

describe('UpdateService', () => {
  it('reports when no GitHub release exists', async () => {
    const state = await build({ latest: null }).check();
    expect(state.phase).toBe('no-release');
    expect(state.message).toContain('GitHub');
  });

  it('reports up to date without downloading metadata', async () => {
    const fake = adapter({ fetchText: async () => { throw new Error('should not fetch'); } });
    const state = await build({ currentVersion: '1.1.0', adapter: fake }).check();
    expect(state.phase).toBe('up-to-date');
  });

  it('finds a newer release and exposes its notes', async () => {
    const output: UpdateState[] = [];
    const state = await build({ output: (item) => output.push(item) }).check();
    expect(state.phase).toBe('available');
    expect(state.latestVersion).toBe('1.1.0');
    expect(state.notes).toContain('一键更新');
    expect(output.map((item) => item.phase)).toContain('checking');
  });

  it('uses GitHub digest when latest.yml is absent', async () => {
    const latest = { ...release(), assets: release().assets.filter((asset) => asset.name !== 'latest.yml') };
    const state = await build({ latest }).check();
    expect(state.phase).toBe('available');
  });

  it('blocks install when neither latest.yml nor digest is available', async () => {
    const latest = {
      ...release(),
      assets: [
        {
          name: INSTALLER,
          downloadUrl: 'https://github.com/xiao-dudu/memex/releases/download/v1.1.0/Memex.Setup.1.1.0.exe',
        },
      ],
    };
    const state = await build({ latest }).check();
    expect(state.phase).toBe('error');
    expect(state.message).toContain('校验');
  });

  it('downloads, verifies, launches the installer and quits', async () => {
    vi.useFakeTimers();
    const fake = adapter();
    const instance = build({ adapter: fake });
    expect((await instance.check()).phase).toBe('available');

    const state = await instance.install();
    expect(state.phase).toBe('downloaded');
    expect(fake.downloaded[0]?.destination).toBe(`C:/temp/${INSTALLER}`);
    expect(fake.installed).toEqual([`C:/temp/${INSTALLER}`]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.quit).toBe(1);
    vi.useRealTimers();
  });

  it('verifies with sha256 when GitHub digest is the only source', async () => {
    vi.useFakeTimers();
    const latest = { ...release(), assets: release().assets.filter((asset) => asset.name !== 'latest.yml') };
    const instance = build({ latest, hash: Buffer.from(SHA256, 'hex').toString('base64'), hashAlgorithm: 'sha256', delayMs: 1 });
    await instance.check();
    const state = await instance.install();
    expect(state.phase).toBe('downloaded');
    vi.useRealTimers();
  });

  it('aborts when the downloaded hash does not match', async () => {
    const removed: string[] = [];
    const fake = adapter();
    const instance = build({ adapter: fake, hash: 'wrong', removeFile: (path) => removed.push(path), delayMs: 0 });
    await instance.check();
    const state = await instance.install();

    expect(state.phase).toBe('error');
    expect(state.message).toContain('校验');
    expect(fake.installed).toEqual([]);
    expect(removed).toEqual([`C:/temp/${INSTALLER}`]);
  });

  it('tracks download progress', async () => {
    const updates: UpdateState[] = [];
    const instance = build({ output: (state) => updates.push(state) });
    await instance.check();
    await instance.install();
    const progress = updates.filter((state) => state.phase === 'downloading').map((state) => state.progress);
    expect(progress).toContain(50);
    expect(progress).toContain(100);
  });
});
