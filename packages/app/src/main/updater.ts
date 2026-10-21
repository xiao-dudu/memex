import { app, BrowserWindow, net } from 'electron';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { downloadFile, hashFile, removeFile } from './update-io.js';
import { UpdateService, type UpdateRelease, type UpdateReleaseAsset } from './update-service.js';

const DEFAULT_OWNER = 'duzhilong';
const DEFAULT_REPO = 'memex';

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string | null;
  size?: number;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubAsset[];
}

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

function normalizeAsset(asset: GitHubAsset): UpdateReleaseAsset | null {
  const name = asset.name?.trim();
  const downloadUrl = asset.browser_download_url;
  if (!name || !downloadUrl) return null;
  return { name, downloadUrl, digest: asset.digest ?? null, size: asset.size };
}

function rateLimitMessage(response: Response): string | null {
  if (response.status !== 403 && response.status !== 429) return null;
  if (response.headers.get('x-ratelimit-remaining') !== '0') return null;
  const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0);
  if (!reset) return 'GitHub API 请求过于频繁，请稍后再试。';
  const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000));
  return `GitHub API 请求次数已达上限，请约 ${minutes} 分钟后重试。`;
}

async function fetchLatestRelease(): Promise<UpdateRelease | null> {
  if (!app.isPackaged) {
    throw new Error('开发模式不支持自动更新，请使用打包后的应用检查更新。');
  }

  const { owner, name } = repo();
  const response = await net.fetch(`https://api.github.com/repos/${owner}/${name}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Memex-Updater',
      'Cache-Control': 'no-cache',
    },
  });

  const limited = rateLimitMessage(response);
  if (limited) throw new Error(limited);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);

  const data = (await response.json()) as GitHubRelease;
  if (data.draft || data.prerelease) return null;

  const tag = data.tag_name?.trim();
  if (!tag) throw new Error('最新发行版缺少版本标签');

  return {
    tag,
    name: data.name?.trim() || tag,
    body: data.body ?? '',
    htmlUrl: data.html_url ?? `https://github.com/${owner}/${name}/releases/tag/${encodeURIComponent(tag)}`,
    assets: (data.assets ?? [])
      .map(normalizeAsset)
      .filter((asset): asset is UpdateReleaseAsset => asset !== null),
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await net.fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  return response.text();
}

function runInstaller(path: string): void {
  // NSIS cannot reliably replace a running executable. Wait for this process to
  // exit, install silently, then relaunch the updated binary.
  const quote = (value: string) => value.replace(/'/g, "''");
  const script = [
    `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`,
    `Start-Process -FilePath '${quote(path)}' -ArgumentList '/S' -Wait`,
    `Start-Process -FilePath '${quote(process.execPath)}'`,
  ].join('; ');
  const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export function initUpdateService(): UpdateService {
  if (service) return service;

  service = new UpdateService({
    currentVersion: () => app.getVersion(),
    fetchLatestRelease,
    fetchText,
    downloadFile,
    runInstaller,
    quitApp: () => app.quit(),
    hashFile,
    removeFile,
    tempPath: (name) => join(app.getPath('temp'), `memex-update-${Date.now()}-${basename(name)}`),
    onState: publishState,
    installDelayMs: 1200,
  });

  return service;
}

export function getUpdateService(): UpdateService {
  return service ?? initUpdateService();
}
