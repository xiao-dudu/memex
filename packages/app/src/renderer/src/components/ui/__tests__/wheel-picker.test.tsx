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
});
