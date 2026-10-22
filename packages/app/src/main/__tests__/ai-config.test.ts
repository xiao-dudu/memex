// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, runMigrations, type MemexDatabase } from '@memex/shared';
import { createAiConfigStore, type SecretAdapter } from '../ai-config';

let db: MemexDatabase;

const adapter: SecretAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`),
  decryptString: (value) => value.toString().replace(/^enc:/, ''),
};

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-ai-config-')), 'test.db'));
  runMigrations(db);
});

describe('AI config store', () => {
  it('never exposes the key and can decrypt it for the main process', () => {
    const store = createAiConfigStore(db, adapter);
    const saved = store.save({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: 'secret',
    });

    expect(saved).toEqual({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    expect(JSON.stringify(store.getPublic())).not.toContain('secret');
    expect(store.getCredentials()).toEqual({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: 'secret',
    });

    const encrypted = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key_encrypted'").get() as {
      value: string;
    };
    expect(encrypted.value).not.toContain('secret');
  });

  it('refuses to store a key when encryption is unavailable', () => {
    const store = createAiConfigStore(db, { ...adapter, isEncryptionAvailable: () => false });
    expect(() => store.save({ apiKey: 'secret' })).toThrow('安全存储不可用');
    expect(store.getPublic().hasApiKey).toBe(false);
  });

  it('clears the key without changing other settings', () => {
    const store = createAiConfigStore(db, adapter);
    store.save({ baseUrl: 'http://localhost:1234/v1', model: 'local', apiKey: 'secret' });
    store.save({ clearApiKey: true });

    expect(store.getPublic()).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local',
      hasApiKey: false,
    });
    expect(store.getCredentials().apiKey).toBeNull();

    store.save({ apiKey: 'again' });
    store.save({ apiKey: '' });
    expect(store.getPublic().hasApiKey).toBe(false);
  });

  it('returns no key for malformed ciphertext without deleting it', () => {
    const store = createAiConfigStore(db, {
      ...adapter,
      decryptString: () => {
        throw new Error('decrypt failed');
      },
    });
    store.save({ apiKey: 'secret' });
    expect(store.getCredentials().apiKey).toBeNull();
    expect(store.getPublic().hasApiKey).toBe(true);
    expect(db.prepare("SELECT count(*) AS count FROM settings WHERE key = 'ai_api_key_encrypted'").get()).toEqual({
      count: 1,
    });
  });

  it('persists public settings across store instances and validates patches', () => {
    createAiConfigStore(db, adapter).save({ baseUrl: 'https://api.example.com/v1', model: 'model-a' });
    const store = createAiConfigStore(db, adapter);
    expect(store.getPublic()).toEqual({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: false,
    });
    expect(() => store.save({ apiKey: 'secret', clearApiKey: true })).toThrow();
  });
});

