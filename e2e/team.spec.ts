import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const electronPath = require('electron') as string;
const appRoot = resolve('packages/app');
const dataDir = resolve('test-results/e2e-team-data');

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  app = await electron.launch({
    executablePath: electronPath,
    args: [appRoot],
    env: {
      ...process.env,
      MEMEX_DB_PATH: resolve(dataDir, 'memex.db'),
      MEMEX_USER_DATA: resolve(dataDir, 'userdata'),
      MEMEX_SUPABASE_URL: '',
      MEMEX_SUPABASE_ANON_KEY: '',
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('personal tasks still work when team cloud is not configured', async () => {
  const composer = page.getByLabel('快速添加任务');
  await composer.fill('个人任务不受团队影响');
  await composer.press('Enter');
  await expect(page.getByText('个人任务不受团队影响', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: '团队', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录团队空间' })).toBeVisible();
  await expect(page.getByText('团队服务未配置')).toBeVisible();

  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await expect(page.getByText('个人任务不受团队影响', { exact: true }).first()).toBeVisible();
});
