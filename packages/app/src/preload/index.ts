import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type MemexApi } from '@memex/shared/ipc';

const api: MemexApi = {
  tasks: {
    list: (filter) => ipcRenderer.invoke(IPC.tasksList, filter),
    get: (id) => ipcRenderer.invoke(IPC.tasksGet, id),
    create: (input) => ipcRenderer.invoke(IPC.tasksCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.tasksUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.tasksDelete, id),
    restore: (id) => ipcRenderer.invoke(IPC.tasksRestore, id),
    purge: (id) => ipcRenderer.invoke(IPC.tasksPurge, id),
    counts: () => ipcRenderer.invoke(IPC.tasksCounts),
  },
  notes: {
    list: (filter) => ipcRenderer.invoke(IPC.notesList, filter),
    get: (id) => ipcRenderer.invoke(IPC.notesGet, id),
    create: (input) => ipcRenderer.invoke(IPC.notesCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.notesUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.notesDelete, id),
    restore: (id) => ipcRenderer.invoke(IPC.notesRestore, id),
    purge: (id) => ipcRenderer.invoke(IPC.notesPurge, id),
    counts: () => ipcRenderer.invoke(IPC.notesCounts),
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC.tagsList),
  },
  search: (query, limit) => ipcRenderer.invoke(IPC.search, query, limit),
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    copyMcpConfig: () => ipcRenderer.invoke(IPC.appCopyMcpConfig),
    backupNow: () => ipcRenderer.invoke(IPC.appBackupNow),
    exportJson: () => ipcRenderer.invoke(IPC.appExportJson),
  },
  window: {
    showMain: () => ipcRenderer.invoke(IPC.windowShowMain),
    hideQuickCapture: () => ipcRenderer.invoke(IPC.windowHideQuickCapture),
    setTheme: (theme) => ipcRenderer.invoke(IPC.windowSetTheme, theme),
  },
};

contextBridge.exposeInMainWorld('memex', api);
