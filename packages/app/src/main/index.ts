import { app, BrowserWindow } from 'electron';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { closeDatabase, getRepositories, initDatabase } from './db.js';
import { registerIpcHandlers } from './ipc.js';
import { maybeDailyBackup } from './data.js';
import { createMainWindow, getMainWindow, showMainWindow } from './windows/main.js';
import { destroyTray, createTray } from './system/tray.js';
import { registerShortcuts, unregisterShortcuts } from './system/shortcuts.js';
import { initUpdateService } from './updater.js';

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
