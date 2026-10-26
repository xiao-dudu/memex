import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

export interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** 右侧滑出的面板：背后内容仍然可见，适合长文本反复对照。 */
export function Drawer({ open, title, description, onClose, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // 挂到 body：外层 motion 容器的 transform 会成为 fixed 定位的包含块，直接渲染会被困在里面。
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <motion.div
            className="absolute inset-0 bg-black/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative flex h-full w-[min(560px,92vw)] flex-col border-l border-[var(--line)] bg-[var(--bg)] shadow-[-16px_0_48px_rgba(0,0,0,0.12)]"
          >
            <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[14px] font-semibold text-[var(--ink)]">{title}</h2>
                {description ? <p className="mt-0.5 truncate text-[12px] text-[var(--faint)]">{description}</p> : null}
              </div>
              <button
                onClick={onClose}
                aria-label="关闭"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              >
                <X size={16} />
              </button>
            </header>

            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer ? (
              <footer className="flex items-center gap-2 border-t border-[var(--line)] px-5 py-3 text-[12px] text-[var(--faint)]">
                {footer}
              </footer>
            ) : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
