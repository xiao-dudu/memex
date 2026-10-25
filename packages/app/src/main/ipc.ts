import { app, ipcMain, nativeTheme, net } from 'electron';
import {
  IPC,
  aiConfigPatchSchema,
  noteCreateSchema,
  noteFilterSchema,
  noteUpdateSchema,
  reportCandidateQuerySchema,
  reportGenerateSchema,
  reportTemplateCreateSchema,
  reportTemplateUpdateSchema,
  reportUpdateSchema,
  searchQuerySchema,
  settingsPatchSchema,
  taskCreateSchema,
  taskFilterSchema,
  taskUpdateSchema,
  type AiServiceConfigPatch,
  type NoteInput,
  type NotePatch,
  type ReportGenerateInput,
  type ReportTemplateInput,
  type ReportTemplatePatch,
  type ReportUpdateInput,
  type TaskInput,
  type TaskPatch,
} from '@memex/shared';
import { getDbPath, getRepositories } from './db.js';
import { buildMcpConfig, backupNow, copyMcpConfig, exportJson } from './data.js';
import { testAiConnection, type FetchLike } from './ai-client.js';
import { exportReportMarkdown, exportReportPdf } from './report-export.js';
import { getUpdateService } from './updater.js';
import { getMainWindow, showMainWindow } from './windows/main.js';
import { hideQuickCapture } from './windows/quick-capture.js';

let reportGenerationController: AbortController | null = null;
const netFetch = ((input, init) => net.fetch(String(input), init)) as FetchLike;

function idSchema(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('无效的 ID');
  return value;
}

function reportForExport(id: string) {
  const report = getRepositories().reports.get(id);
  if (!report) throw new Error('报告不存在');
  return report;
}

function draftAiConfig(patch?: AiServiceConfigPatch) {
  const parsed = aiConfigPatchSchema.parse(patch ?? {});
  const resolved = getRepositories().aiConfig.resolveConnectionConfig(parsed);
  if (!resolved.baseUrl.trim() || !resolved.model.trim()) throw new Error('请先填写 Base URL 和模型名称');
  return resolved;
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
  ipcMain.handle(IPC.tagsRemove, (_event, id) => getRepositories().tags.remove(idSchema(id)));

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
      mcpTaskWrite: parsed.mcpTaskWrite,
    });
    if (parsed.autoLaunch !== undefined) {
      app.setLoginItemSettings({ openAtLogin: parsed.autoLaunch });
    }
    return settings;
  });

  ipcMain.handle(IPC.templatesList, () => getRepositories().reportTemplates.list());
  ipcMain.handle(IPC.templatesGet, (_event, id) => getRepositories().reportTemplates.get(idSchema(id)));
  ipcMain.handle(IPC.templatesCreate, (_event, input) => {
    const parsed = reportTemplateCreateSchema.parse(input);
    return getRepositories().reportTemplates.create(parsed as ReportTemplateInput);
  });
  ipcMain.handle(IPC.templatesUpdate, (_event, id, patch) => {
    const parsed = reportTemplateUpdateSchema.parse(patch);
    return getRepositories().reportTemplates.update(idSchema(id), parsed as ReportTemplatePatch);
  });
  ipcMain.handle(IPC.templatesDelete, (_event, id) => getRepositories().reportTemplates.remove(idSchema(id)));

  ipcMain.handle(IPC.reportsList, () => getRepositories().reports.list());
  ipcMain.handle(IPC.reportsGet, (_event, id) => getRepositories().reports.get(idSchema(id)));

  ipcMain.handle(IPC.reportsCandidates, (_event, query) => {
    const parsed = reportCandidateQuerySchema.parse(query);
    return getRepositories().reportService.listCandidates(parsed.periodStart, parsed.periodEnd);
  });

  ipcMain.handle(IPC.reportsGenerate, async (_event, input) => {
    if (reportGenerationController) throw new Error('已有周报正在生成');
    const parsed = reportGenerateSchema.parse(input) as ReportGenerateInput;
    const controller = new AbortController();
    reportGenerationController = controller;
    try {
      return await getRepositories().reportService.generate(parsed, controller.signal);
    } finally {
      if (reportGenerationController === controller) reportGenerationController = null;
    }
  });

  ipcMain.handle(IPC.reportsCancel, () => {
    reportGenerationController?.abort();
  });

  ipcMain.handle(IPC.reportsUpdate, (_event, id, patch) => {
    const parsed = reportUpdateSchema.parse(patch);
    return getRepositories().reports.update(idSchema(id), parsed as ReportUpdateInput);
  });
  ipcMain.handle(IPC.reportsDelete, (_event, id) => getRepositories().reports.remove(idSchema(id)));
  ipcMain.handle(IPC.reportsExportMarkdown, (_event, id) =>
    exportReportMarkdown(reportForExport(idSchema(id))),
  );
  ipcMain.handle(IPC.reportsExportPdf, (_event, id) => exportReportPdf(reportForExport(idSchema(id))));

  ipcMain.handle(IPC.aiGetConfig, () => getRepositories().aiConfig.getPublic());
  ipcMain.handle(IPC.aiUpdateConfig, (_event, patch) => {
    const parsed = aiConfigPatchSchema.parse(patch);
    return getRepositories().aiConfig.save(parsed);
  });
  ipcMain.handle(IPC.aiTestConnection, async (_event, patch) => {
    const result = await testAiConnection(draftAiConfig(patch), netFetch);
    return { ok: true as const, latencyMs: result.latencyMs };
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

  ipcMain.handle(IPC.updateCheck, () => getUpdateService().check());
  ipcMain.handle(IPC.updateInstall, () => getUpdateService().install());
  ipcMain.handle(IPC.updateGetState, () => getUpdateService().getState());

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
