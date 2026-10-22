import { writeFile as writeFileDefault } from 'node:fs/promises';
import type { Report } from '@memex/shared';
import MarkdownIt from 'markdown-it';
import type { BrowserWindow, SaveDialogOptions, SaveDialogReturnValue } from 'electron';

interface BrowserWindowLike {
  loadURL(url: string): Promise<void>;
  webContents: {
    printToPDF(options?: { printBackground?: boolean; pageSize?: string }): Promise<Buffer>;
  };
  isDestroyed(): boolean;
  destroy(): void;
}

export interface ReportExportDependencies {
  showSaveDialog?: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  writeFile?: typeof writeFileDefault;
  createPdfWindow?: () => BrowserWindowLike;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function safeTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/[-. ]+$/g, '')
    .trim()
    .slice(0, 120);
}

export function reportFileName(report: Report, extension: 'md' | 'pdf' = 'md'): string {
  const start = formatLocalDate(report.periodStart);
  const end = formatLocalDate(report.periodEnd - 1);
  const normalizedTitle = report.title.trim();
  const title = normalizedTitle === `${start} 至 ${end} 周报` ? '周报' : safeTitle(normalizedTitle) || '周报';
  const stem = `${start}-${end}-${title}`;
  return `${stem}.${extension}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false });
markdown.renderer.rules.image = (tokens, index) => escapeHtml(tokens[index]?.content ?? '');
markdown.renderer.rules.link_open = () => '';
markdown.renderer.rules.link_close = () => '';

export function renderMarkdownHtml(contentMarkdown: string): string {
  return markdown.render(contentMarkdown);
}

function printableHtml(contentMarkdown: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #26231f;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", sans-serif;
      font-size: 11pt;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    h1, h2, h3, h4 { line-height: 1.35; margin: 1.2em 0 0.55em; break-after: avoid; }
    h1 { font-size: 22pt; }
    h2 { font-size: 17pt; }
    h3 { font-size: 14pt; }
    p, ul, ol, blockquote, pre { margin: 0.6em 0; }
    ul, ol { padding-left: 1.6em; }
    blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #b8afa2; color: #625b52; }
    code { font-family: "Cascadia Code", Consolas, monospace; font-size: 0.92em; }
    pre { overflow-wrap: anywhere; white-space: pre-wrap; background: #f4f1ea; padding: 0.8em; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d9d2c7; padding: 0.35em 0.5em; text-align: left; }
  </style>
</head>
<body>
${renderMarkdownHtml(contentMarkdown)}
</body>
</html>`;
}

async function defaultShowSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const { dialog } = await import('electron');
  return dialog.showSaveDialog(options);
}

async function createDefaultPdfWindow(): Promise<BrowserWindowLike> {
  const { BrowserWindow: ElectronBrowserWindow } = await import('electron');
  return new ElectronBrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }) as BrowserWindow & BrowserWindowLike;
}

export async function exportReportMarkdown(
  report: Report,
  dependencies: ReportExportDependencies = {},
): Promise<string | null> {
  const showSaveDialog = dependencies.showSaveDialog ?? defaultShowSaveDialog;
  const result = await showSaveDialog({
    title: '导出 Markdown',
    defaultPath: reportFileName(report, 'md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return null;

  const writeFile = dependencies.writeFile ?? writeFileDefault;
  await writeFile(result.filePath, report.contentMarkdown, 'utf8');
  return result.filePath;
}

export async function exportReportPdf(
  report: Report,
  dependencies: ReportExportDependencies = {},
): Promise<string | null> {
  const showSaveDialog = dependencies.showSaveDialog ?? defaultShowSaveDialog;
  const result = await showSaveDialog({
    title: '导出 PDF',
    defaultPath: reportFileName(report, 'pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;

  let window: BrowserWindowLike | null = null;
  try {
    window = dependencies.createPdfWindow ? dependencies.createPdfWindow() : await createDefaultPdfWindow();
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(printableHtml(report.contentMarkdown))}`;
    await window.loadURL(dataUrl);
    const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const writeFile = dependencies.writeFile ?? writeFileDefault;
    await writeFile(result.filePath, pdf);
    return result.filePath;
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
}
