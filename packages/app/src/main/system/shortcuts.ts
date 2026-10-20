import { globalShortcut } from 'electron';
import { showQuickCapture } from '../windows/quick-capture.js';

export function registerShortcuts(): void {
  globalShortcut.register('CommandOrControl+Shift+Space', showQuickCapture);
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
