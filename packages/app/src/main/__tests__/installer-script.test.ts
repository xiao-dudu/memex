import { describe, expect, it } from 'vitest';
import { buildInstallerInvocation, INSTALLER_ARGS } from '../installer-script';

describe('installer invocation', () => {
  it('runs the NSIS installer silently in update mode', () => {
    expect(INSTALLER_ARGS).toContain('/S');
    expect(INSTALLER_ARGS).toContain('--updated');
  });

  it('invokes the downloaded installer with the update flags', () => {
    const invocation = buildInstallerInvocation('C:/Temp/Memex-Setup-1.1.3.exe');

    expect(invocation.file).toBe('C:/Temp/Memex-Setup-1.1.3.exe');
    expect(invocation.args).toEqual(['/S', '--updated']);
  });

  it('returns a fresh args array so callers cannot mutate the shared constant', () => {
    const first = buildInstallerInvocation('a.exe');
    const second = buildInstallerInvocation('b.exe');

    first.args.push('--tampered');
    expect(second.args).toEqual(['/S', '--updated']);
    expect(INSTALLER_ARGS).toHaveLength(2);
  });
});
