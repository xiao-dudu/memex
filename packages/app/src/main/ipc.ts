import { app, ipcMain, nativeTheme } from 'electron';
import {
  IPC,
  noteCreateSchema,
  noteFilterSchema,
  noteUpdateSchema,
  searchQuerySchema,
  settingsPatchSchema,
  taskCreateSchema,
  taskFilterSchema,
  taskUpdateSchema,
  type NoteInput,
  type NotePatch,
  type TaskInput,
  type TaskPatch,
} from '@memex/shared';
import { getDbPath, getRepositories } from './db.js';
import { buildMcpConfig, backupNow, copyMcpConfig, exportJson } from './data.js';
import { getMainWindow, showMainWindow } from './windows/main.js';
import { hideQuickCapture } from './windows/quick-capture.js';

function idSchema(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('无效的 ID');
  return value;
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.tasksList, (_event, filter) => {
    return getRepositories().tasks.list(taskFilterSchema.parse(filter));
  });

  ipcMain.handle(IPC.tasksGet, (_event, id) => getRepositories().tasks.get(idSchema(id)));

  ipcMain.handle(IPC.tasksCreate, (_event, input) => {
    return getRepositories().tasks.create(taskCreateSchema.parse(input) as TaskInput);
  });

  ipcMain.handle(IPC.tasksUpdate, (_event, id, patch) => {
    return getRepositories().tasks.update(idSchema(id), taskUpdateSchema.parse(patch) as TaskPatch);
  });

  ipcMain.handle(IPC.tasksDelete, (_event, id) => getRepositories().tasks.softDelete(idSchema(id)));
  ipcMain.handle(IPC.tasksRestore, (_event, id) => getRepositories().tasks.restore(idSchema(id)));
  ipcMain.handle(IPC.tasksPurge, (_event, id) => getRepositories().tasks.purge(idSchema(id)));
  ipcMain.handle(IPC.tasksCounts, () => getRepositories().tasks.counts());

  ipcMain.handle(IPC.notesList, (_event, filter) => {
    return getRepositories().notes.list(noteFilterSchema.parse(filter));
  });

  ipcMain.handle(IPC.notesGet, (_event, id) => getRepositories().notes.get(idSchema(id)));

  ipcMain.handle(IPC.notesCreate, (_event, input) => {
    return getRepositories().notes.create(noteCreateSchema.parse(input) as NoteInput);
  });

  ipcMain.handle(IPC.notesUpdate, (_event, id, patch) => {
    return getRepositories().notes.update(idSchema(id), noteUpdateSchema.parse(patch) as NotePatch);
  });

  ipcMain.handle(IPC.notesDelete, (_event, id) => getRepositories().notes.softDelete(idSchema(id)));
  ipcMain.handle(IPC.notesRestore, (_event, id) => getRepositories().notes.restore(idSchema(id)));
  ipcMain.handle(IPC.notesPurge, (_event, id) => getRepositories().notes.purge(idSchema(id)));
  ipcMain.handle(IPC.notesCounts, () => getRepositories().notes.counts());

  ipcMain.handle(IPC.tagsList, () => getRepositories().tags.list());

  ipcMain.handle(IPC.search, (_event, query, limit) => {
    const parsed = searchQuerySchema.parse({ query, limit });
    return getRepositories().search.search(parsed.query, parsed.limit);
  });

  ipcMain.handle(IPC.settingsGet, () => getRepositories().settings.get());

  ipcMain.handle(IPC.settingsUpdate, (_event, patch) => {
    const parsed = settingsPatchSchema.parse(patch);
    const settings = getRepositories().settings.update({
      mcpAccessMode: parsed.mcpAccessMode,
      closeToTray: parsed.closeToTray,
      autoLaunch: parsed.autoLaunch,
      quickCaptureHideOnBlur: parsed.quickCaptureHideOnBlur,
      theme: parsed.theme,
    });
    if (parsed.autoLaunch !== undefined) {
      app.setLoginItemSettings({ openAtLogin: parsed.autoLaunch });
    }
    return settings;
  });

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    dbPath: getDbPath(),
    userDataPath: app.getPath('userData'),
    mcpConfig: buildMcpConfig(),
  }));

  ipcMain.handle(IPC.appCopyMcpConfig, () => copyMcpConfig());
  ipcMain.handle(IPC.appBackupNow, () => backupNow());
  ipcMain.handle(IPC.appExportJson, () => exportJson());

  ipcMain.handle(IPC.windowShowMain, () => showMainWindow());
  ipcMain.handle(IPC.windowHideQuickCapture, () => hideQuickCapture());

  ipcMain.handle(IPC.windowSetTheme, (_event, theme: 'system' | 'light' | 'dark') => {
    const window = getMainWindow();
    if (!window) return;
    const dark =
      theme === 'dark' ||
      (theme === 'system' && nativeTheme.shouldUseDarkColors);
    window.setBackgroundColor(dark ? '#151412' : '#f2efe8');
    window.setTitleBarOverlay({
      color: dark ? '#151412' : '#f2efe8',
      symbolColor: dark ? '#f1ece3' : '#232019',
      height: 40,
    });
  });
}
