import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecretAdapter } from '../ai-config.js';

export interface TeamSessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createEncryptedSessionStorage(filePath: string, adapter: SecretAdapter): TeamSessionStorage {
  return {
    async getItem() {
      if (!existsSync(filePath)) return null;
      if (!adapter.isEncryptionAvailable()) throw new Error('安全存储不可用，无法读取团队登录状态');
      const encrypted = Buffer.from(readFileSync(filePath, 'utf8'), 'base64');
      return adapter.decryptString(encrypted);
    },
    async setItem(_key, value) {
      if (!adapter.isEncryptionAvailable()) throw new Error('安全存储不可用，无法保存团队登录状态');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, adapter.encryptString(value).toString('base64'), 'utf8');
    },
    async removeItem() {
      rmSync(filePath, { force: true });
    },
  };
}
