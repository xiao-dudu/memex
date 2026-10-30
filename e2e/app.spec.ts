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
    args: [appRoot],
    env: { ...process.env, MEMEX_DB_PATH: dbPath, MEMEX_USER_DATA: resolve(dataDir, 'userdata') },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('creates tasks, edits a note, searches, and exposes MCP config', async () => {
  const composer = page.getByLabel('快速添加任务');
  await composer.fill('项目计划评审');
  await composer.press('Enter');
  await composer.fill('给设计师回复邮件');
  await composer.press('Enter');
  await expect(page.getByText('项目计划评审', { exact: true })).toBeVisible();

  await page.getByText('项目计划评审', { exact: true }).click();
  const title = page.getByPlaceholder('任务标题');
  await title.fill('项目计划评审（终稿）');
  // 描述改成「3 行预览 + 抽屉富文本」，这里走真实交互：点开抽屉写，关掉后看预览。
  await page.getByRole('button', { name: '打开任务描述' }).click();
  const descriptionDrawer = page.getByRole('dialog', { name: '任务描述' });
  const description = descriptionDrawer.locator('.ProseMirror');
  await description.click();
  await description.pressSequentially('确认范围、时间线和交付物');
  await descriptionDrawer.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('button', { name: '打开任务描述' })).toContainText('确认范围');
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

  await page.keyboard.press('Control+F');
  await page.getByPlaceholder('搜索任务与笔记…').fill('项目计划');
  await expect(page.getByText('项目计划评审（终稿）', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTitle('设置').click();
  // 弹窗默认停在「外观」页，要先切到 AI 访问权限才能看到复制按钮。
  await page.getByText('AI 访问权限', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI 访问权限' })).toBeVisible();
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

test('任务计时跟随模块切换：任务页窄条，离开后撑开', async () => {
  const composer = page.getByLabel('快速添加任务');
  await composer.fill('专注写文档');
  await composer.press('Enter');

  await page.getByRole('button', { name: '设置任务计时' }).click();
  await page.getByRole('button', { name: '正计时', exact: true }).click();
  await page.getByRole('button', { name: '开始正计时' }).click();

  const bar = page.getByRole('button', { name: /^任务计时/ });
  await expect(bar).toBeVisible();
  await expect(bar).not.toContainText('专注写文档');

  await page.getByRole('button', { name: '笔记', exact: true }).first().click();
  await expect(bar).toContainText('专注写文档');

  await bar.click();
  await expect(page.getByText('打开任务')).toBeVisible();
  await page.getByRole('button', { name: '结束计时' }).click();
  await expect(page.getByRole('button', { name: /^任务计时/ })).toHaveCount(0);
});

test('最小化时弹出桌面计时小组件，恢复后收回', async () => {
  const composer = page.getByLabel('快速添加任务');
  await composer.fill('桌面小组件');
  await composer.press('Enter');
  await page.getByRole('button', { name: '设置任务计时' }).click();
  await page.getByRole('button', { name: '15 分钟' }).click();

  const widgetVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (window) => window.webContents.getURL().includes('timer-widget') && window.isVisible(),
      ),
    );

  // getAllWindows 的顺序不保证主窗口在前，按 URL 找主窗口
  const mainWindowCall = (method: 'minimize' | 'restore') =>
    app.evaluate(({ BrowserWindow }, name) => {
      const main = BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes('timer-widget'));
      if (name === 'minimize') main?.minimize();
      else main?.restore();
    }, method);

  await mainWindowCall('minimize');
  await page.waitForTimeout(1200);
  expect(await widgetVisible()).toBe(true);

  await mainWindowCall('restore');
  await page.waitForTimeout(800);
  expect(await widgetVisible()).toBe(false);
});
