import { Menu, Tray, nativeImage } from 'electron';
import { showMainWindow } from '../windows/main.js';
import { showQuickCapture } from '../windows/quick-capture.js';

let tray: Tray | null = null;

// A small ink-drop mark. Keeping it inline avoids shipping a binary asset just
// for the tray while the app is still being built.
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMgqEFAJ0kA/2vC7WvAAAAAElFTkSuQmCC';

export function createTray(): void {
  const image = nativeImage.createFromDataURL(ICON_DATA_URL).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('Memex');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Memex', click: showMainWindow },
      { label: '快速记录', click: showQuickCapture },
      { type: 'separator' },
      { label: '退出', click: () => process.exit(0) },
    ]),
  );
  tray.on('double-click', showMainWindow);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
