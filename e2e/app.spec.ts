import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const electronPath = require('electron') as string;
const appRoot = resolve('packages/app');
const dataDir = resolve('test-results/e2e-data');
const dbPath = resolve(dataDir, 'memex-e2e.db');
const preloadPath = resolve('packages/app/out/preload/index.cjs');
const quickCaptureHtml = resolve('packages/app/out/renderer/quick-capture.html');

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  app = await electron.launch({
    executablePath: electronPath,
    args: [`--user-data-dir=${resolve(dataDir, 'userdata')}`, appRoot],
    env: { ...process.env, MEMEX_DB_PATH: dbPath },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('creates tasks, edits a note, searches, and exposes MCP config', async () => {
  const composer = page.getByPlaceholder('快速添加任务，回车创建');
  await composer.fill('项目计划评审');
  await composer.press('Enter');
  await composer.fill('给设计师回复邮件');
  await composer.press('Enter');
  await expect(page.getByText('项目计划评审', { exact: true })).toBeVisible();

  await page.getByText('项目计划评审', { exact: true }).click();
  const title = page.getByPlaceholder('任务标题');
  await title.fill('项目计划评审（终稿）');
  await page.getByPlaceholder('补充描述、上下文或下一步…').fill('确认范围、时间线和交付物');
  await expect(title).toHaveValue('项目计划评审（终稿）');
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: '笔记', exact: true }).first().click();
  await page.getByText('新建笔记', { exact: true }).click();
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await editor.pressSequentially('会议记录 2026-10-20');
  await editor.press('Enter');
  await editor.pressSequentially('确认项目计划与下一步安排。');
  await expect(page.getByText('会议记录 2026-10-20').first()).toBeVisible();

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder('搜索任务与笔记…').fill('项目计划');
  await expect(page.getByText('项目计划评审（终稿）', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTitle('设置').click();
  await expect(page.getByText('AI 访问权限')).toBeVisible();
  await page.getByText('复制 MCP 配置').click();
  const config = await app.evaluate(({ clipboard }) => clipboard.readText());
  const parsed = JSON.parse(config) as {
    mcpServers: { memex: { command: string; args: string[]; env: Record<string, string> } };
  };
  expect(parsed.mcpServers.memex.command).toContain('electron');
  expect(parsed.mcpServers.memex.args[0]).toContain('index.mjs');
  expect(parsed.mcpServers.memex.env.ELECTRON_RUN_AS_NODE).toBe('1');
});

test('quick capture saves a task', async () => {
  const quickPromise = app.waitForEvent('window');
  await app.evaluate(
    ({ BrowserWindow }, paths) => {
      const window = new BrowserWindow({
        width: 600,
        height: 220,
        show: true,
        frame: false,
        webPreferences: {
          preload: paths.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      void window.loadFile(paths.quickCaptureHtml);
    },
    { preloadPath, quickCaptureHtml },
  );

  const quick = await quickPromise;
  await quick.locator('textarea').fill('快速捕获的任务');
  await quick.locator('textarea').press('Enter');

  await quick.waitForTimeout(600);
  const db = new DatabaseSync(dbPath);
  const rows = db.prepare('select title from tasks').all();
  db.close();
  expect(JSON.stringify(rows)).toContain('快速捕获的任务');
});
