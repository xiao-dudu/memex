export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 悬浮球尺寸固定。一旦在悬停时改窗口尺寸，渲染层重排和窗口几何会有几帧不同步，
 * 胶囊就会在左上/右下之间抖，所以这里不做展开。
 * 宽度按最长读数 `1:02:05` 估算并留出余量，避免读数被挤成省略号。
 */
export const TIMER_WIDGET_PILL = { width: 208, height: 44 };

/** 首次出现时贴在右下角，留出任务栏间距。 */
export function defaultWidgetBounds(workArea: Rect): Rect {
  return {
    x: Math.round(workArea.x + workArea.width - TIMER_WIDGET_PILL.width - 24),
    y: Math.round(workArea.y + workArea.height - TIMER_WIDGET_PILL.height - 24),
    width: TIMER_WIDGET_PILL.width,
    height: TIMER_WIDGET_PILL.height,
  };
}

/** 把窗口收进工作区，避免拖到屏幕外回不来。 */
export function clampWidgetBounds(bounds: Rect, workArea: Rect): Rect {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
  return {
    x: Math.round(Math.min(Math.max(bounds.x, workArea.x), maxX)),
    y: Math.round(Math.min(Math.max(bounds.y, workArea.y), maxY)),
    width: bounds.width,
    height: bounds.height,
  };
}
