import type { MemexDatabase } from '../db/database.js';
import type { MemexSettings } from '../types.js';

const DEFAULTS: MemexSettings = {
  mcpAccessMode: 'tasks',
  mcpTaskWrite: false,
  mcpNoteWrite: false,
  closeToTray: true,
  autoLaunch: false,
  quickCaptureHideOnBlur: true,
  theme: 'system',
  lastBackupAt: 0,
};

const KEY_MAP: Record<keyof MemexSettings, string> = {
  mcpAccessMode: 'mcp_access_mode',
  mcpTaskWrite: 'mcp_task_write',
  mcpNoteWrite: 'mcp_note_write',
  closeToTray: 'close_to_tray',
  autoLaunch: 'auto_launch',
  quickCaptureHideOnBlur: 'quick_capture_hide_on_blur',
  theme: 'theme',
  lastBackupAt: 'last_backup_at',
};

export interface SettingsRepository {
  get(): MemexSettings;
  update(patch: Partial<MemexSettings>): MemexSettings;
}

export function createSettingsRepository(db: MemexDatabase): SettingsRepository {
  return {
    get() {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      const stored = new Map(rows.map((row) => [row.key, row.value]));
      const result = { ...DEFAULTS };
      for (const [field, key] of Object.entries(KEY_MAP) as [keyof MemexSettings, string][]) {
        const raw = stored.get(key);
        if (raw === undefined) continue;
        try {
          (result as Record<string, unknown>)[field] = JSON.parse(raw);
        } catch {
          // Keep the default when a malformed value is encountered.
        }
      }
      return result;
    },

    update(patch) {
      const apply = db.transaction(() => {
        for (const [field, value] of Object.entries(patch) as [keyof MemexSettings, unknown][]) {
          if (value === undefined) continue;
          const key = KEY_MAP[field];
          db.prepare(`
            INSERT INTO settings(key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).run(key, JSON.stringify(value));
        }
      });
      apply();
      return this.get();
    },
  };
}
