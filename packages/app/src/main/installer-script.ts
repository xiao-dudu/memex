export const INSTALLER_ARGS = ['/S', '--updated'] as const;

export interface InstallerScriptOptions {
  installerPath: string;
  appPath: string;
  pid: number;
}

function quotePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * NSIS cannot replace a running executable. The app must exit first, so a
 * detached PowerShell script waits for this process, runs the installer in
 * silent update mode, and relaunches the freshly installed binary.
 *
 * `--updated` is required: without it the assisted (oneClick: false) installer
 * exits successfully but does not apply the update.
 */
export function buildInstallerScript({ installerPath, appPath, pid }: InstallerScriptOptions): string {
  const argumentList = INSTALLER_ARGS.map((argument) => `'${argument}'`).join(',');
  return [
    `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    `Start-Process -FilePath '${quotePowerShell(installerPath)}' -ArgumentList ${argumentList} -Wait`,
    `Start-Process -FilePath '${quotePowerShell(appPath)}'`,
  ].join('; ');
}
