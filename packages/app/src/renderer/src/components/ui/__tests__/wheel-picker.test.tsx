import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WheelPicker } from '../wheel-picker';

describe('wheel picker', () => {
  it('渲染整段刻度并高亮当前值', () => {
    render(<WheelPicker value={25} onChange={() => undefined} min={0} max={59} label="分钟" />);
    expect(screen.getAllByRole('option')).toHaveLength(60);
    expect(screen.getByRole('option', { selected: true }).textContent).toBe('25');
  });

  it('点击某一格回调该值', () => {
    const onChange = vi.fn();
    render(<WheelPicker value={25} onChange={onChange} min={0} max={59} label="分钟" />);
    fireEvent.click(screen.getByRole('option', { name: '40' }));
    expect(onChange).toHaveBeenCalledWith(40);
  });

  it('方向键上下切换，并在边界处停住', () => {
    const onChange = vi.fn();
    render(<WheelPicker value={59} onChange={onChange} min={0} max={59} label="分钟" />);
    const listbox = screen.getByRole('listbox', { name: '分钟' });

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(58);
  });

  it('小时列只渲染 24 个刻度', () => {
    render(<WheelPicker value={0} onChange={() => undefined} min={0} max={23} label="小时" />);
    expect(screen.getAllByRole('option')).toHaveLength(24);
  });

  it('滚轮一格只走一行，连续事件不丢步', () => {
    const onChange = vi.fn();
    render(<WheelPicker value={25} onChange={onChange} min={0} max={59} label="分钟" />);
    const scroller = screen.getByRole('listbox', { name: '分钟' }).querySelector('.wheel-scroll')!;

    // 原生滚动一格约 100px，行高只有 26px，若不接管会一次跳 4 行
    fireEvent.wheel(scroller, { deltaY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(26);

    // 父组件还没重渲染就又来一格，也要接着 +1 而不是原地重复
    fireEvent.wheel(scroller, { deltaY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(27);

    fireEvent.wheel(scroller, { deltaY: -100 });
    expect(onChange).toHaveBeenLastCalledWith(26);
  });

  it('滚轮在两端不再越界', () => {
    const onChange = vi.fn();
    render(<WheelPicker value={59} onChange={onChange} min={0} max={59} label="分钟" />);
    const scroller = screen.getByRole('listbox', { name: '分钟' }).querySelector('.wheel-scroll')!;

    fireEvent.wheel(scroller, { deltaY: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
