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
    remove: (id) => ipcRenderer.invoke(IPC.tagsRemove, id),
  },
  search: (query, limit) => ipcRenderer.invoke(IPC.search, query, limit),
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  templates: {
    list: () => ipcRenderer.invoke(IPC.templatesList),
    get: (id) => ipcRenderer.invoke(IPC.templatesGet, id),
    create: (input) => ipcRenderer.invoke(IPC.templatesCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.templatesUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.templatesDelete, id),
  },
  reports: {
    list: () => ipcRenderer.invoke(IPC.reportsList),
    get: (id) => ipcRenderer.invoke(IPC.reportsGet, id),
    candidates: (query) => ipcRenderer.invoke(IPC.reportsCandidates, query),
    generate: (input) => ipcRenderer.invoke(IPC.reportsGenerate, input),
    cancel: () => ipcRenderer.invoke(IPC.reportsCancel),
    update: (id, patch) => ipcRenderer.invoke(IPC.reportsUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.reportsDelete, id),
    exportMarkdown: (id) => ipcRenderer.invoke(IPC.reportsExportMarkdown, id),
    exportPdf: (id) => ipcRenderer.invoke(IPC.reportsExportPdf, id),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC.aiGetConfig),
    updateConfig: (patch) => ipcRenderer.invoke(IPC.aiUpdateConfig, patch),
    testConnection: (patch) => ipcRenderer.invoke(IPC.aiTestConnection, patch),
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    copyMcpConfig: () => ipcRenderer.invoke(IPC.appCopyMcpConfig),
    backupNow: () => ipcRenderer.invoke(IPC.appBackupNow),
    exportJson: () => ipcRenderer.invoke(IPC.appExportJson),
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    getState: () => ipcRenderer.invoke(IPC.updateGetState),
    onState: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state);
      ipcRenderer.on(IPC.updateState, listener);
      return () => ipcRenderer.removeListener(IPC.updateState, listener);
    },
  },
  window: {
    showMain: () => ipcRenderer.invoke(IPC.windowShowMain),
    hideQuickCapture: () => ipcRenderer.invoke(IPC.windowHideQuickCapture),
    setTheme: (theme) => ipcRenderer.invoke(IPC.windowSetTheme, theme),
  },
};

contextBridge.exposeInMainWorld('memex', api);
