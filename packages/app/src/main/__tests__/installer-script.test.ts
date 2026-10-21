import { describe, expect, it } from 'vitest';
import { buildInstallerScript, INSTALLER_ARGS } from '../installer-script';

describe('installer script', () => {
  it('runs the NSIS installer silently in update mode', () => {
    expect(INSTALLER_ARGS).toContain('/S');
    expect(INSTALLER_ARGS).toContain('--updated');
  });

  it('waits for the app to exit before installing, then relaunches', () => {
    const script = buildInstallerScript({
      installerPath: 'C:/Temp/Memex-Setup-1.1.3.exe',
      appPath: 'E:/Memex/Memex.exe',
      pid: 4242,
    });

    expect(script).toContain('Wait-Process -Id 4242');
    expect(script).toContain("'/S'");
    expect(script).toContain("'--updated'");
    expect(script).toContain('Memex-Setup-1.1.3.exe');
    expect(script).toContain("Start-Process -FilePath 'E:/Memex/Memex.exe'");
    expect(script.indexOf('Wait-Process')).toBeLessThan(script.indexOf('--updated'));
  });

  it('escapes single quotes in Windows paths', () => {
    const script = buildInstallerScript({
      installerPath: "C:/Temp/it's here/setup.exe",
      appPath: "E:/Memex/it's/Memex.exe",
      pid: 1,
    });

    expect(script).toContain("it''s here");
    expect(script).toContain("it''s/Memex.exe");
  });
});
