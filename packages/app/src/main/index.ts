import { app, BrowserWindow, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { IPC } from '@memex/shared';
import { closeDatabase, getRepositories, initDatabase } from './db.js';
import { registerIpcHandlers } from './ipc.js';
import { maybeDailyBackup } from './data.js';
import { createMainWindow, getMainWindow, showMainWindow } from './windows/main.js';
import { attachTimerWidgetToWindow, registerTimerWidgetIpc } from './windows/timer-widget.js';
import { destroyTray, createTray } from './system/tray.js';
import { registerShortcuts, unregisterShortcuts } from './system/shortcuts.js';
import { initUpdateService } from './updater.js';
import { getTeamConfig } from './team/team-config.js';
import { createEncryptedSessionStorage } from './team/team-session-storage.js';
import { createTeamClient } from './team/team-client.js';
import { openTeamCache } from './team/team-cache.js';
import { createTeamSync } from './team/team-sync.js';
import { createTeamRemoteApi } from './team/team-remote-api.js';
import { createTeamRealtime } from './team/team-realtime.js';
import { createTeamService } from './team/team-service.js';
import { registerTeamIpc } from './team/team-ipc.js';

let quitting = false;

if (process.env.MEMEX_USER_DATA) {
  const userData = resolve(process.env.MEMEX_USER_DATA);
  mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.memex.desktop');
    initDatabase();
    initUpdateService();
    registerIpcHandlers();

    const window = createMainWindow();
    registerTimerWidgetIpc();
    attachTimerWidgetToWindow(window);

    const teamConfig = getTeamConfig();
    if (teamConfig.configured) {
      const cache = openTeamCache(join(app.getPath('userData'), 'team-cache.db'));
      const storage = createEncryptedSessionStorage(join(app.getPath('userData'), 'team-session.bin'), safeStorage);
      const client = createTeamClient(teamConfig, storage);
      const api = createTeamRemoteApi(client.getSupabase());
      const sync = createTeamSync({ api, cache, isOnline: () => true, now: Date.now });
      const realtime = createTeamRealtime(client.getSupabase());
      const teamService = createTeamService({
        client,
        cache,
        sync,
        api,
        realtime,
        now: Date.now,
        randomId: randomUUID,
        isOnline: () => true,
      });
      registerTeamIpc(teamService, (state) => getMainWindow()?.webContents.send(IPC.teamSyncState, state));
      window.on('focus', () => void teamService.sync().catch(() => undefined));
      app.on('before-quit', () => cache.close());
    }
    window.on('close', (event) => {
      if (quitting) return;
      const closeToTray = getRepositories().settings.get().closeToTray;
      if (closeToTray) {
        event.preventDefault();
        window.hide();
      }
    });

    createTray();
    registerShortcuts();
    await maybeDailyBackup().catch((error) => console.error('Backup failed', error));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      showMainWindow();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    unregisterShortcuts();
    destroyTray();
    closeDatabase();
  });

  app.on('window-all-closed', () => {
    // Keep the app alive in the tray on Windows.
  });
}
