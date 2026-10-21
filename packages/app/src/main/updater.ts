import { app, BrowserWindow, net } from 'electron';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { buildInstallerInvocation } from './installer-script.js';
import {
  buildLatestReleaseUrl,
  buildReleaseAssetUrl,
  buildReleasePageUrl,
  extractFirstReleaseNotes,
  extractReleaseTag,
} from './release-discovery.js';
import { downloadFile, hashFile, removeFile } from './update-io.js';
import { parseLatestMetadata, UpdateService, type UpdateRelease, type UpdateReleaseAsset } from './update-service.js';

const DEFAULT_OWNER = 'xiao-dudu';
const DEFAULT_REPO = 'memex';

let service: UpdateService | null = null;

function repo(): { owner: string; name: string } {
  return {
    owner: process.env.MEMEX_UPDATE_OWNER?.trim() || DEFAULT_OWNER,
    name: process.env.MEMEX_UPDATE_REPO?.trim() || DEFAULT_REPO,
  };
}

function publishState(state: ReturnType<UpdateService['getState']>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('update:state', state);
    }
  }
}

function resolveLatestTag(owner: string, name: string): Promise<string | null> {
  const url = buildLatestReleaseUrl(owner, name);

  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'HEAD', url, redirect: 'manual' });
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch {
        // Already finished.
      }
      fail(new Error('连接 GitHub 超时'));
    }, 30_000);

    request.on('redirect', (_status, _method, redirectUrl) => {
      clearTimeout(timer);
      finish(extractReleaseTag(redirectUrl));
      try {
        request.abort();
      } catch {
        // Abort is best-effort.
      }
    });

    request.on('response', (response) => {
      clearTimeout(timer);
      const status = response.statusCode;
      response.on('data', () => undefined);
      response.on('end', () => finish(status === 404 ? null : null));
      response.on('error', (error) => fail(error));
    });

    request.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });

    request.end();
  });
}

/**
 * Resolves the latest release without the GitHub REST API.
 *
 * A HEAD request to /releases/latest emits a redirect to /releases/tag/<tag>;
 * release assets then live at predictable URLs. This avoids the anonymous API
 * quota entirely, which matters on shared/VPN exit IPs.
 */
async function fetchLatestRelease(): Promise<UpdateRelease | null> {
  if (!app.isPackaged) {
    throw new Error('开发模式不支持自动更新，请使用打包后的应用检查更新。');
  }

  const { owner, name } = repo();
  const tag = await resolveLatestTag(owner, name);
  if (!tag) return null;

  const metadataUrl = buildReleaseAssetUrl(owner, name, tag, 'latest.yml');
  const metadataResponse = await net.fetch(metadataUrl, {
    headers: { 'User-Agent': 'Memex-Updater', 'Cache-Control': 'no-cache' },
  });
  if (!metadataResponse.ok) {
    throw new Error(`无法读取 latest.yml（HTTP ${metadataResponse.status}）`);
  }
  const metadata = parseLatestMetadata(await metadataResponse.text());

  const assets: UpdateReleaseAsset[] = [
    { name: 'latest.yml', downloadUrl: metadataUrl },
    {
      name: metadata.path,
      downloadUrl: buildReleaseAssetUrl(owner, name, tag, metadata.path),
    },
  ];

  const notes = await fetchReleaseNotes(owner, name).catch(() => '');

  return {
    tag,
    name: `Memex ${tag}`,
    body: notes,
    htmlUrl: buildReleasePageUrl(owner, name, tag),
    assets,
  };
}

async function fetchReleaseNotes(owner: string, name: string): Promise<string> {
  const response = await net.fetch(`https://github.com/${owner}/${name}/releases.atom`, {
    headers: { 'User-Agent': 'Memex-Updater' },
  });
  if (!response.ok) return '';
  return extractFirstReleaseNotes(await response.text());
}

async function fetchText(url: string): Promise<string> {
  const response = await net.fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  return response.text();
}

function runInstaller(path: string): void {
  // `--updated` makes NSIS close the running app, install silently and
  // relaunch afterwards, so no helper process has to survive our exit.
  const invocation = buildInstallerInvocation(path);
  const child = spawn(invocation.file, invocation.args, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', (error) => console.error('Failed to start installer', error));
  child.unref();
}

export function initUpdateService(): UpdateService {
  if (service) return service;

  service = new UpdateService({
    currentVersion: () => app.getVersion(),
    fetchLatestRelease,
    fetchText,
    downloadFile: (url, destination, onProgress) =>
      downloadFile(url, destination, onProgress, {
        // Electron's net.fetch uses Chromium's network stack, so Windows
        // system proxy / PAC settings and VPN routing are honored. Node's
        // global fetch / https module ignore them.
        fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
          net.fetch(input as string, init)) as typeof fetch,
      }),
    runInstaller,
    quitApp: () => app.quit(),
    hashFile,
    removeFile,
    tempPath: (name, version) => join(app.getPath('temp'), `memex-update-${version}-${basename(name)}`),
    onState: publishState,
    installDelayMs: 1200,
  });

  return service;
}

export function getUpdateService(): UpdateService {
  return service ?? initUpdateService();
}
