import type { UpdateState } from '@memex/shared';

export type { UpdateState } from '@memex/shared';

export interface UpdateReleaseAsset {
  name: string;
  downloadUrl: string;
  /** GitHub computes this server-side, e.g. "sha256:abc...". */
  digest?: string | null;
  size?: number;
}

export interface UpdateRelease {
  tag: string;
  name: string;
  body: string;
  htmlUrl: string;
  assets: UpdateReleaseAsset[];
}

export interface LatestMetadata {
  version: string;
  path: string;
  sha512: string;
}

export type ChecksumAlgorithm = 'sha512' | 'sha256';

export interface Checksum {
  algorithm: ChecksumAlgorithm;
  value: string;
}

export interface UpdateAdapter {
  fetchText(url: string): Promise<string>;
  downloadFile(url: string, destination: string, onProgress: (percent: number) => void): Promise<void>;
  runInstaller(path: string): void;
  quitApp(): void;
}

export interface UpdateServiceDependencies {
  currentVersion: () => string;
  fetchLatestRelease: () => Promise<UpdateRelease | null>;
  fetchText: UpdateAdapter['fetchText'];
  downloadFile: UpdateAdapter['downloadFile'];
  runInstaller: UpdateAdapter['runInstaller'];
  quitApp: UpdateAdapter['quitApp'];
  hashFile: (path: string, algorithm: ChecksumAlgorithm) => Promise<string>;
  removeFile: (path: string) => void;
  tempPath: (name: string) => string;
  onState: (state: UpdateState) => void;
  installDelayMs?: number;
}

interface PendingUpdate {
  release: UpdateRelease;
  installer: UpdateReleaseAsset;
  checksum: Checksum;
}

/** Compares dotted release versions without pulling in a semver dependency. */
export function compareVersions(left: string, right: string): number {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/^v/i, '')
      .split('-')
      .at(0)
      ?.split('.')
      .map((part) => Number.parseInt(part, 10) || 0) ?? [];

  const a = normalize(left);
  const b = normalize(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function requireMatch(text: string, expression: RegExp, field: string): string {
  const match = expression.exec(text);
  if (!match?.[1]) throw new Error(`latest.yml 缺少 ${field}`);
  return unquote(match[1]);
}

/** Parses the subset of latest.yml written by electron-builder. */
export function parseLatestMetadata(text: string): LatestMetadata {
  try {
    return {
      version: requireMatch(text, /^version:\s*(.+)$/m, 'version'),
      path: requireMatch(text, /^path:\s*(.+)$/m, 'path'),
      sha512: requireMatch(text, /^\s+sha512:\s*(.+)$/m, 'sha512'),
    };
  } catch (error) {
    throw new Error(`latest.yml 无效：${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parses GitHub's "algorithm:hex" asset digest and normalizes it to base64,
 * which is the format our hashFile() produces and electron-builder's
 * latest.yml uses for sha512.
 */
export function parseDigest(digest: string | null | undefined): Checksum | null {
  if (!digest) return null;
  const separator = digest.indexOf(':');
  if (separator <= 0) return null;
  const algorithm = digest.slice(0, separator);
  const value = digest.slice(separator + 1).trim();
  if (!/^[0-9a-f]+$/i.test(value)) return null;
  if (algorithm !== 'sha256' && algorithm !== 'sha512') return null;

  const expectedHexLength = algorithm === 'sha256' ? 64 : 128;
  if (value.length !== expectedHexLength) return null;

  return { algorithm, value: Buffer.from(value, 'hex').toString('base64') };
}

function normalizeVersion(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

function findAsset(release: UpdateRelease, fileName: string): UpdateReleaseAsset | undefined {
  const decoded = decodeURIComponent(fileName);
  return release.assets.find((asset) => asset.name === fileName || asset.name === decoded);
}

export class UpdateService {
  private state: UpdateState;
  private pending: PendingUpdate | null = null;
  private readonly installDelayMs: number;

  constructor(private readonly dependencies: UpdateServiceDependencies) {
    this.installDelayMs = dependencies.installDelayMs ?? 1200;
    this.state = {
      phase: 'idle',
      currentVersion: dependencies.currentVersion(),
    };
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  private emit(patch: Partial<UpdateState>): UpdateState {
    this.state = {
      ...this.state,
      currentVersion: this.dependencies.currentVersion(),
      ...patch,
    };
    this.dependencies.onState({ ...this.state });
    return this.getState();
  }

  async check(): Promise<UpdateState> {
    this.pending = null;
    this.emit({ phase: 'checking', message: '正在检查更新…', progress: undefined });

    try {
      const release = await this.dependencies.fetchLatestRelease();
      if (!release) {
        return this.emit({
          phase: 'no-release',
          message: '尚未创建可用的发行版，请先在 GitHub 创建 Release。',
          latestVersion: undefined,
          releaseUrl: undefined,
          notes: undefined,
        });
      }

      const latestVersion = normalizeVersion(release.tag);
      const currentVersion = this.dependencies.currentVersion();
      if (compareVersions(latestVersion, currentVersion) <= 0) {
        return this.emit({
          phase: 'up-to-date',
          latestVersion,
          releaseUrl: release.htmlUrl,
          notes: release.body,
          message: `当前已是最新版本 v${currentVersion}`,
        });
      }

      const metadataAsset = findAsset(release, 'latest.yml');
      let installerName: string | undefined;
      let checksum: Checksum | null = null;

      if (metadataAsset) {
        const metadata = parseLatestMetadata(await this.dependencies.fetchText(metadataAsset.downloadUrl));
        if (compareVersions(metadata.version, latestVersion) !== 0) {
          return this.emit({
            phase: 'error',
            latestVersion,
            releaseUrl: release.htmlUrl,
            notes: release.body,
            message: `版本信息不一致：Release 是 v${latestVersion}，latest.yml 是 v${metadata.version}。`,
          });
        }
        installerName = metadata.path;
        checksum = { algorithm: 'sha512', value: metadata.sha512 };
      }

      const installer =
        (installerName ? findAsset(release, installerName) : undefined) ??
        release.assets.find((asset) => /\.exe$/i.test(asset.name) && !/uninstaller/i.test(asset.name));

      if (!installer) {
        return this.emit({
          phase: 'error',
          latestVersion,
          releaseUrl: release.htmlUrl,
          notes: release.body,
          message: '发行版缺少 Windows 安装包，无法自动更新。',
        });
      }

      checksum ??= parseDigest(installer.digest);
      if (!checksum) {
        return this.emit({
          phase: 'error',
          latestVersion,
          releaseUrl: release.htmlUrl,
          notes: release.body,
          message: '无法获取安装包校验值（latest.yml 或 GitHub digest），已阻止自动安装。',
        });
      }

      this.pending = { release, installer, checksum };
      return this.emit({
        phase: 'available',
        latestVersion,
        releaseUrl: release.htmlUrl,
        notes: release.body,
        message: `发现新版本 v${latestVersion}`,
        progress: undefined,
      });
    } catch (error) {
      return this.emit({
        phase: 'error',
        message: `检查更新失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async install(): Promise<UpdateState> {
    if (!this.pending) {
      return this.emit({
        phase: 'error',
        message: '当前没有可安装的更新，请先检查更新。',
      });
    }

    const { installer, checksum } = this.pending;
    const destination = this.dependencies.tempPath(installer.name);
    this.emit({ phase: 'downloading', progress: 0, message: '正在下载更新…' });

    try {
      await this.dependencies.downloadFile(installer.downloadUrl, destination, (percent) => {
        this.setProgress(percent);
      });

      const hash = await this.dependencies.hashFile(destination, checksum.algorithm);
      if (hash.toLowerCase() !== checksum.value.toLowerCase()) {
        this.dependencies.removeFile(destination);
        return this.emit({
          phase: 'error',
          message: '安装包校验失败，已删除下载文件，请重试。',
          progress: undefined,
        });
      }

      this.dependencies.runInstaller(destination);
      this.pending = null;
      const state = this.emit({
        phase: 'downloaded',
        progress: 100,
        message: '下载完成，正在重启安装…',
      });
      setTimeout(() => this.dependencies.quitApp(), this.installDelayMs);
      return state;
    } catch (error) {
      this.dependencies.removeFile(destination);
      return this.emit({
        phase: 'error',
        message: `下载更新失败：${error instanceof Error ? error.message : String(error)}`,
        progress: undefined,
      });
    }
  }

  setProgress(percent: number): UpdateState {
    const progress = Math.min(100, Math.max(0, Math.round(percent)));
    return this.emit({ phase: 'downloading', progress, message: `正在下载更新 ${progress}%` });
  }

  fail(message: string): UpdateState {
    return this.emit({ phase: 'error', message });
  }
}
