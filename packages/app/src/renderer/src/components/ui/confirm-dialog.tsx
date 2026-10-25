import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 破坏性操作的二次确认。默认走 danger 样式，Esc / 点遮罩取消。
 * 说明文案里应写清影响范围，而不是只问「确定吗」。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '删除',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-[400px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-5 shadow-[var(--shadow)]"
          >
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description ? <div className="mt-2 text-[13px] leading-6 text-[var(--muted)]">{description}</div> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button variant="danger" size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
