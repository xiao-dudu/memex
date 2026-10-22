import type { MemexDatabase } from '@memex/shared';
import { aiConfigPatchSchema, type AiServiceConfig, type AiServiceConfigPatch } from '@memex/shared';

const BASE_URL_KEY = 'ai_base_url';
const MODEL_KEY = 'ai_model';
const API_KEY_CIPHERTEXT_KEY = 'ai_api_key_encrypted';

export interface SecretAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ElectronSafeStorageApi {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface AiConfigStore {
  getPublic(): AiServiceConfig;
  save(patch: AiServiceConfigPatch): AiServiceConfig;
  getCredentials(): { baseUrl: string; model: string; apiKey: string | null };
}

export function createElectronSecretAdapter(api: ElectronSafeStorageApi): SecretAdapter {
  return {
    isEncryptionAvailable: () => api.isEncryptionAvailable(),
    encryptString: (value) => api.encryptString(value),
    decryptString: (value) => api.decryptString(value),
  };
}

function readStringSetting(db: MemexDatabase, key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return '';
  try {
    const value = JSON.parse(row.value) as unknown;
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function writeStringSetting(db: MemexDatabase, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

export function createAiConfigStore(db: MemexDatabase, secretAdapter: SecretAdapter): AiConfigStore {
  const getCiphertext = (): string | null => {
    const value = readStringSetting(db, API_KEY_CIPHERTEXT_KEY);
    return value.length > 0 ? value : null;
  };

  return {
    getPublic() {
      return {
        baseUrl: readStringSetting(db, BASE_URL_KEY),
        model: readStringSetting(db, MODEL_KEY),
        hasApiKey: getCiphertext() !== null,
      };
    },

    save(patch) {
      const value = aiConfigPatchSchema.parse(patch);
      let encryptedKey: string | null | undefined;
      if (value.apiKey !== undefined && value.apiKey.length > 0) {
        if (!secretAdapter.isEncryptionAvailable()) throw new Error('安全存储不可用，无法保存 API Key');
        encryptedKey = secretAdapter.encryptString(value.apiKey).toString('base64');
      } else if (value.clearApiKey || value.apiKey === '') {
        encryptedKey = null;
      }

      const apply = db.transaction(() => {
        if (value.baseUrl !== undefined) writeStringSetting(db, BASE_URL_KEY, value.baseUrl);
        if (value.model !== undefined) writeStringSetting(db, MODEL_KEY, value.model);
        if (encryptedKey === null) {
          db.prepare('DELETE FROM settings WHERE key = ?').run(API_KEY_CIPHERTEXT_KEY);
        } else if (encryptedKey !== undefined) {
          writeStringSetting(db, API_KEY_CIPHERTEXT_KEY, encryptedKey);
        }
      });
      apply();
      return this.getPublic();
    },

    getCredentials() {
      const encrypted = getCiphertext();
      let apiKey: string | null = null;
      if (encrypted) {
        try {
          apiKey = secretAdapter.decryptString(Buffer.from(encrypted, 'base64'));
        } catch {
          apiKey = null;
        }
      }
      return {
        baseUrl: readStringSetting(db, BASE_URL_KEY),
        model: readStringSetting(db, MODEL_KEY),
        apiKey,
      };
    },
  };
}
