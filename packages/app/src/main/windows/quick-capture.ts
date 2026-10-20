import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { getRepositories } from '../db.js';

let quickWindow: BrowserWindow | null = null;

export function getQuickCaptureWindow(): BrowserWindow | null {
  return quickWindow;
}

export function createQuickCaptureWindow(): BrowserWindow {
  quickWindow = new BrowserWindow({
    width: 600,
    height: 220,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  quickWindow.on('blur', () => {
    const hide = getRepositories().settings.get().quickCaptureHideOnBlur;
    if (hide) quickWindow?.hide();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void quickWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/quick-capture.html`);
  } else {
    void quickWindow.loadFile(join(__dirname, '../renderer/quick-capture.html'));
  }

  return quickWindow;
}

export function showQuickCapture(): void {
  if (!quickWindow || quickWindow.isDestroyed()) createQuickCaptureWindow();

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width } = display.workArea;
  const bounds = quickWindow!.getBounds();
  quickWindow!.setPosition(Math.round(x + (width - bounds.width) / 2), y + 120, false);
  quickWindow!.show();
  quickWindow!.focus();
  quickWindow!.webContents.send('quick-capture:focus');
}

export function hideQuickCapture(): void {
  quickWindow?.hide();
}
