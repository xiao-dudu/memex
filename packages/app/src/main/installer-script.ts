/**
 * electron-builder's NSIS installer understands these flags:
 *
 * - `/S`         silent install, no UI
 * - `--updated`  update mode: close the running app and install in place
 * - `--force-run` relaunch the app after a silent install
 *
 * `--updated` makes the installer safe to launch while the app is running.
 * `--force-run` is required because this is an assisted installer
 * (`oneClick: false`): in silent mode it only relaunches when force-run is set.
 */
export const INSTALLER_ARGS = ['/S', '--updated', '--force-run'] as const;

export interface InstallerInvocation {
  file: string;
  args: string[];
}

export function buildInstallerInvocation(installerPath: string): InstallerInvocation {
  return { file: installerPath, args: [...INSTALLER_ARGS] };
}
