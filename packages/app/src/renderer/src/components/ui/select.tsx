import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  /** 触发器最小宽度，面板不会窄于它 */
  minWidth?: number;
  maxPanelHeight?: number;
}

const PANEL_GAP = 6;

/**
 * 自建下拉：原生 <select> 的弹层由 Chromium 渲染，无法跟随应用配色，
 * 选中行是系统蓝底，和纸面/墨色的设计语言冲突。
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = '请选择',
  label,
  className,
  minWidth = 160,
  maxPanelHeight = 260,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: minWidth });
  const [cursor, setCursor] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openPanel = () => {
    const anchor = triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(rect.width, minWidth);
    const estimated = Math.min(options.length * 32 + 12, maxPanelHeight);
    const fitsBelow = rect.bottom + PANEL_GAP + estimated <= window.innerHeight - 8;
    setPosition({
      top: fitsBelow ? rect.bottom + PANEL_GAP : Math.max(8, rect.top - estimated - PANEL_GAP),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
    });
    setCursor(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const closePanel = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const pick = (option: SelectOption) => {
    onChange(option.value);
    closePanel();
  };

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setCursor((current) => Math.max(0, Math.min(options.length - 1, current + delta)));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setCursor(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[cursor];
      if (option) pick(option);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePanel(false) : openPanel())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          'inline-flex h-8 max-w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--ink)] transition hover:border-[var(--line-strong)]',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', selected ? '' : 'text-[var(--faint)]')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} className={cn('shrink-0 text-[var(--faint)] transition', open ? 'rotate-180' : '')} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={panelRef}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={onPanelKeyDown}
              initial={{ opacity: 0, y: -4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.14 }}
              style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: maxPanelHeight }}
              className="thin-scroll z-[70] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1 shadow-[var(--shadow)] outline-none"
            >
              {options.length === 0 ? (
                <p className="px-2 py-1.5 text-[12px] text-[var(--faint)]">没有可选项</p>
              ) : (
                options.map((option, index) => {
                  const active = option.value === value;
                  return (
                    <button
                      key={option.value || `empty-${index}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-index={index}
                      tabIndex={-1}
                      onClick={() => pick(option)}
                      onMouseEnter={() => setCursor(index)}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] transition-colors',
                        index === cursor ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--ink)]',
                        active ? 'font-medium' : '',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {active ? <Check size={12} className="shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
