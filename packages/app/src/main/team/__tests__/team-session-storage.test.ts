// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SecretAdapter } from '../../ai-config.js';
import { createEncryptedSessionStorage } from '../team-session-storage.js';

const adapter: SecretAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').slice(4),
};

describe('team session storage', () => {
  it('writes ciphertext and reads it back', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'memex-team-session-')), 'session.bin');
    const storage = createEncryptedSessionStorage(file, adapter);
    await storage.setItem('sb-session', '{"refresh_token":"secret"}');
    expect(readFileSync(file, 'utf8')).not.toContain('refresh_token');
    await expect(storage.getItem('sb-session')).resolves.toBe('{"refresh_token":"secret"}');
  });

  it('removes the session file', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'memex-team-session-')), 'session.bin');
    const storage = createEncryptedSessionStorage(file, adapter);
    await storage.setItem('sb-session', 'value');
    await storage.removeItem('sb-session');
    await expect(storage.getItem('sb-session')).resolves.toBeNull();
  });

  it('refuses to persist when encryption is unavailable', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'memex-team-session-')), 'session.bin');
    const storage = createEncryptedSessionStorage(file, { ...adapter, isEncryptionAvailable: () => false });
    const error = await storage.setItem('sb-session', 'value').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : '').toContain('安全存储不可用');
  });
});
