/**
 * electron-builder's NSIS installer understands these flags:
 *
 * - `/S`        silent install, no UI
 * - `--updated` update mode: close the running app, install, then relaunch
 *
 * `--updated` is what makes the installer safe to launch while the app is
 * still running, so the app never has to coordinate a shutdown by itself.
 */
export const INSTALLER_ARGS = ['/S', '--updated'] as const;

export interface InstallerInvocation {
  file: string;
  args: string[];
}

export function buildInstallerInvocation(installerPath: string): InstallerInvocation {
  return { file: installerPath, args: [...INSTALLER_ARGS] };
}
