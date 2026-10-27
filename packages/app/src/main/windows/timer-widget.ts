import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC, type TaskTimerAction, type TaskTimerState } from '@memex/shared';
import { getMainWindow } from './main';
import { TIMER_WIDGET_PILL, clampWidgetBounds, defaultWidgetBounds, type Rect } from './timer-widget-bounds';

let widgetWindow: BrowserWindow | null = null;
/** 主窗口推过来的最新状态，小组件挂载时先取这份。 */
let currentTimer: TaskTimerState | null = null;

const POSITION_FILE = 'timer-widget-position.json';

function positionPath(): string {
  return join(app.getPath('userData'), POSITION_FILE);
}

function readSavedPosition(): Rect | null {
  try {
    if (!existsSync(positionPath())) return null;
    const raw = JSON.parse(readFileSync(positionPath(), 'utf8')) as Partial<Rect>;
    if (typeof raw.x !== 'number' || typeof raw.y !== 'number') return null;
    return { x: raw.x, y: raw.y, ...TIMER_WIDGET_PILL };
  } catch {
    return null;
  }
}

function savePosition(bounds: Rect): void {
  try {
    writeFileSync(positionPath(), JSON.stringify({ x: bounds.x, y: bounds.y }), 'utf8');
  } catch {
    // 位置记不住不影响使用
  }
}

function workAreaFor(bounds: Rect): Rect {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });
  return display.workArea;
}

function createWidgetWindow(): BrowserWindow {
  const saved = readSavedPosition();
  const workArea = screen.getPrimaryDisplay().workArea;
  const bounds = saved ? clampWidgetBounds(saved, workAreaFor(saved)) : defaultWidgetBounds(workArea);

  widgetWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // 不抢焦点：点按钮不该把用户从别的应用里拽走
    focusable: false,
    // 透明窗口的原生投影是方形，会把圆角胶囊衬出一圈直角
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.on('moved', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const next = clampWidgetBounds(widgetWindow.getBounds(), workAreaFor(widgetWindow.getBounds()));
    savePosition(next);
  });
  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void widgetWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/timer-widget.html`);
  } else {
    void widgetWindow.loadFile(join(__dirname, '../renderer/timer-widget.html'));
  }

  return widgetWindow;
}

export function getTimerWidgetWindow(): BrowserWindow | null {
  return widgetWindow;
}

export function showTimerWidget(): void {
  if (!currentTimer) return;
  if (!widgetWindow || widgetWindow.isDestroyed()) createWidgetWindow();
  const widget = widgetWindow!;
  widget.showInactive();
  widget.webContents.send(IPC.timerState, currentTimer);
}

export function hideTimerWidget(): void {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.hide();
}

export function isTimerWidgetVisible(): boolean {
  return Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
}

/** 主进程侧的计时状态入口：主窗口推状态、小组件读状态、两边互转操作。 */
export function registerTimerWidgetIpc(): void {
  ipcMain.on(IPC.timerSync, (_event, state: TaskTimerState | null) => {
    currentTimer = state;
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send(IPC.timerState, state);
    }
    // 计时结束/取消后小组件就没意义了
    if (!state) hideTimerWidget();
  });

  ipcMain.handle(IPC.timerGetState, () => currentTimer);

  ipcMain.on(IPC.timerAction, (_event, action: TaskTimerAction) => {
    if (action === 'open') {
      const main = getMainWindow();
      if (main) {
        if (main.isMinimized()) main.restore();
        main.show();
        main.focus();
      }
      hideTimerWidget();
    }
    getMainWindow()?.webContents.send(IPC.timerAction, action);
  });
}

/** 主窗口最小化时把小组件叫出来，恢复时收回去。 */
export function attachTimerWidgetToWindow(main: BrowserWindow): void {
  main.on('minimize', () => showTimerWidget());
  main.on('restore', () => hideTimerWidget());
  main.on('focus', () => hideTimerWidget());
}
