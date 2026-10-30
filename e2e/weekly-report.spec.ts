import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const electronPath = require('electron') as string;
const appRoot = resolve('packages/app');
const dataDir = resolve('test-results/e2e-weekly-report-data');
const dbPath = resolve(dataDir, 'memex-e2e.db');
const exportPath = resolve(dataDir, 'weekly-report.md');
const pdfPath = resolve(dataDir, 'weekly-report.pdf');
const cancelledPdfPath = resolve(dataDir, 'cancelled-report.pdf');

let app: ElectronApplication;
let page: Page;
let server: Server;
let baseUrl = '';
const requestBodies: string[] = [];
const authorizationHeaders: Array<string | undefined> = [];

test.beforeEach(async () => {
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  requestBodies.length = 0;
  authorizationHeaders.length = 0;

  server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requestBodies.push(Buffer.concat(chunks).toString('utf8'));
      authorizationHeaders.push(request.headers.authorization);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: '# 本周完成\n\n- 完成周报模块' } }],
          usage: { prompt_tokens: 32, completion_tokens: 12, total_tokens: 44 },
        }),
      );
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/v1`;

  app = await electron.launch({
    executablePath: electronPath,
    args: [appRoot],
    env: { ...process.env, MEMEX_DB_PATH: dbPath, MEMEX_USER_DATA: resolve(dataDir, 'userdata') },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  if (app) await app.close();
  if (server) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
});

test('create template, generate report, edit and export Markdown', async () => {
  const composer = page.getByLabel('快速添加任务');
  await composer.fill('完成周报模块');
  await composer.press('Enter');
  await expect(page.getByPlaceholder('任务标题')).toHaveValue('完成周报模块');

  await page.getByTitle('设置').click();
  await page.getByLabel('Base URL').fill(baseUrl);
  await page.getByLabel('模型').fill('mock-model');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByText('已保存')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTitle('周报').click();
  await page.getByRole('button', { name: '模板', exact: true }).click();
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByLabel('模板名称').fill('E2E 周报');
  await page.getByLabel('基础提示词').fill('简洁总结本周工作');
  await page.getByRole('button', { name: '保存模板' }).click();
  await expect(page.getByText('已保存')).toBeVisible();

  await page.getByRole('button', { name: '报告', exact: true }).click();
  await page.locator('section').filter({ has: page.getByRole('heading', { name: '周报' }) }).getByRole('button', { name: '新建周报', exact: true }).first().click();
  await page.getByRole('button', { name: '加载任务' }).click();
  await expect(page.getByRole('checkbox', { name: '选择 完成周报模块' })).toBeChecked();
  await page.getByRole('button', { name: '生成周报' }).click();
  await expect(page.getByText(/将发送 1 条任务、0 篇关联笔记到 127\.0\.0\.1:/)).toBeVisible();
  await page.getByRole('button', { name: '确认发送' }).click();

  await expect(page.getByLabel('周报标题')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Markdown 内容')).toHaveValue(/# 本周完成/);
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本周完成' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __reportScriptExecuted?: boolean }).__reportScriptExecuted)).toBeUndefined();

  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog;
  }, pdfPath);
  await page.getByRole('button', { name: '导出 PDF' }).click();
  await expect.poll(() => existsSync(pdfPath)).toBe(true);
  expect(readFileSync(pdfPath).subarray(0, 4).toString()).toBe('%PDF');
  expect(readFileSync(pdfPath).length).toBeGreaterThan(1000);

  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: true, filePath: target })) as typeof dialog.showSaveDialog;
  }, cancelledPdfPath);
  await page.getByRole('button', { name: '导出 PDF' }).click();
  await expect(page.getByText('已取消导出')).toBeVisible();
  expect(existsSync(cancelledPdfPath)).toBe(false);

  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('Markdown 内容').fill('# 编辑后的周报');
  await expect(page.getByText('已保存')).toBeVisible({ timeout: 3000 });

  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog;
  }, exportPath);
  await page.getByRole('button', { name: '导出 Markdown' }).click();
  await expect.poll(() => existsSync(exportPath)).toBe(true);
  expect(readFileSync(exportPath, 'utf8')).toBe('# 编辑后的周报');

  await expect.poll(() => requestBodies.length).toBe(1);
  const payload = JSON.parse(requestBodies[0]!) as {
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
  };
  expect(payload.stream).toBe(false);
  expect(payload.messages[0]?.role).toBe('system');
  expect(payload.messages[1]?.role).toBe('user');
  expect(payload.messages[1]?.content).toContain('完成周报模块');
  expect(authorizationHeaders[0]).toBeUndefined();
});






