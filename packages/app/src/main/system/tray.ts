import { Menu, Tray, nativeImage } from 'electron';
import { showMainWindow } from '../windows/main.js';
import { showQuickCapture } from '../windows/quick-capture.js';

let tray: Tray | null = null;

// 32×32 的托盘标记：墨底 + 奶油衬线 M + 赭红点，与应用图标同一套视觉。
// 直接给 32px 让系统按 DPI 缩到 16/24，比先缩到 16 再被放大清晰。
// 内联 base64 是为了不给托盘单独发布一个二进制资源。
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFT0lEQVR4nMVXa2+URRR+zsy71+62Ja3l0rqtLGGRhJLwQQoxoYioVAlGE0GxYOCDoUJIUH+CX7xAlCJfBKRQ+Wih2ESKxLQKhhAQJALl2qZFKJBettvt7vu+M2Zmu7Vud7tFKpxkks27M/M855znnJkhJIwDsAOBopkOzraSpCoBBAhwACA8mkkJmAzokCSbTFt82dHRfSOJSckfwcC0ajC2nTEqlFJCjck0ItJDCHkfQmy73nHngMLW3s0snf6OwVm9kBJCSsWKTYLnqaZcEoyIMyJYtlh7o/2v76isbFopl3SBGPwKfzgi/6fZRGBSIGyTLGdM4iPGKfcxgSvjCkthamwCrVQpRyLsj8uYwlTYBgglUsrJzrcWEFEi8WnkTFrkhBIjU9iTqk01IcT4wIyp3TFkC5gScDGCQxFJP50bmcAty0JsKKbdSBCRenOP252xRNW8WDQKi3HM9rtQ6ib8GRG4FxcZSRipHxhjGBgYwNLKJdj28YcY7O/XZDw+P34+cQJf7dwFn883JhKcc/T19qJ6wwa8HAqgv24HCnxu9HE3dt6VuHz7HtwOYwx5lkpATXC5XLjS1oYdX+xAIBDA0pdeQcXiCtRseh/FxcWIx+Nj0mPbNrweD2o212C2jIDMOHrgQL4dQ7EZhkUMlCYGLB0BwzDQ09OLhobD+P38ebU9ervvIbegEG++8ToikYiO1Gjvw+Ewli9fhmcCIcSKSiBsC56hCKKScHPQhpNICzIrgSQJh2HA78+Fw+HAjbY2WMKGiMewZvVbKCoqgmmaI1FQ6XA6ndi4cQO6bl3C9MoqLPxkN/pmzsOn1/rQHpNwsvQaYGm+JUgAMC0TXq8XLS2tOHnyFIhzlM0KYtWqlQiHB3QU1FDeL3thKYLBIL7ZswdOzlDy4mr0VFTh9N1+uDnLVAUYv/lIQPdty8befd+CiMGKxbC+ei3y8/O0OBMHjMCWzTU40tiIS5cuw+n1Qtp94LFBeI3M4NkJqOwLAb/fj59OtODcmTOaRGjuXLz2apXWQjQaxaJFFZg/vxy1tbuRk5OjcgJiHJIYRJZDlWUjoCcxhqGoib379oMbHLZp4r311bocBwej2LrlAxxrPo4/Ll6BN8ebaH8TNDaRSarE/Lku/HisGRcvXNAA8xcs0J6HQrNRWbkEtbt2w+NxQGZzOcWMCU/khhbb/rqD+Gz75xCWjfXr3tXV0PrLrzh79hxycrxZW/VDRYBUGx4+VMSwFhqPNuH6lTZIYeH5xYuwomoFamu/1uWaXJPtPJkQASllQuXDDSdumhrkwYMHOFh/CNzpgsPlQmtLK079dlrrQXVIIYVWffJap0r5P0dg6tQiPWbMmIGnCgu1FhTQ9w2H0dXeDu7you5A/XBTgq6AWbOCIMOhPS8NPI3CgoKHI8AYQyQyiIULn8PRpiPIz8vTmzb9cARzQiGdis6uLi3IzpvX0Nx8HF6vBx6PB4fq67D27TXo7upE9+3bKC+fh6ONDXh2TgjR6NC/2nfSKFg2fYxsVeg8Hjd8Pr8OqzKX04m+/n7EYjFNQnmWl5+Hq1ev6TasPJ4yZQps21I335G9Rq9LpwdKR0CZAlEhTy5KHlJJYSl9qA7pdrtGjth/zofE/SF1XaYytNPdilS41CmXGpnRmypRji47FYl0Ns4bw1aNupOItHDTLRw9Uv9LrfnU+eM8cKTGlOhkErJxuNwfroM8mgmFqbGf+MPk1q077RLYxIgREXGZ0MTkPgwTppJhKwyFpTAVtipMrt5otmWvkxL3OWNcMZlsdO0dY+pVdF9hKcyRx+mTfJ7/DfXmpCJd9BOLAAAAAElFTkSuQmCC';

export function createTray(): void {
  const image = nativeImage.createFromDataURL(ICON_DATA_URL);
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
