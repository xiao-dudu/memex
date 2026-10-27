import { describe, expect, it } from 'vitest';
import { TIMER_WIDGET_PILL, clampWidgetBounds, defaultWidgetBounds } from '../windows/timer-widget-bounds';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 };

describe('timer widget bounds', () => {
  it('默认贴在工作区右下角并留出边距', () => {
    const bounds = defaultWidgetBounds(WORK_AREA);
    expect(bounds.width).toBe(TIMER_WIDGET_PILL.width);
    expect(bounds.height).toBe(TIMER_WIDGET_PILL.height);
    expect(bounds.x + bounds.width).toBe(WORK_AREA.width - 24);
    expect(bounds.y + bounds.height).toBe(WORK_AREA.height - 24);
  });

  it('拖出左上角会被拉回工作区', () => {
    const clamped = clampWidgetBounds({ x: -80, y: -40, ...TIMER_WIDGET_PILL }, WORK_AREA);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it('拖出右下角也会被拉回，保证整块可见', () => {
    const clamped = clampWidgetBounds({ x: 5000, y: 5000, ...TIMER_WIDGET_PILL }, WORK_AREA);
    expect(clamped.x + clamped.width).toBe(WORK_AREA.width);
    expect(clamped.y + clamped.height).toBe(WORK_AREA.height);
  });

  it('工作区内的位置原样保留', () => {
    const bounds = { x: 400, y: 300, ...TIMER_WIDGET_PILL };
    expect(clampWidgetBounds(bounds, WORK_AREA)).toEqual(bounds);
  });
});
