import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, RefreshCw, X } from 'lucide-react';
import type { UpdateState } from '@memex/shared';
import { Button } from '../ui/button';
import { ReleaseNotes } from '../ui/release-notes';

export interface UpdatePromptProps {
  state: UpdateState | null;
  onDismiss: () => void;
  onSkip: (version: string) => void;
}

export function UpdatePrompt({ state, onDismiss, onSkip }: UpdatePromptProps) {
  const [progress, setProgress] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!state) {
      setProgress(null);
      return;
    }
    return window.memex.update.onState(setProgress);
  }, [state]);

  const installing = progress?.phase === 'downloading' || progress?.phase === 'downloaded';
  const percent = Math.max(0, Math.min(100, progress?.progress ?? 0));

  return (
    <AnimatePresence>
      {state ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={installing ? undefined : onDismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="发现新版本"
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-2)] shadow-[var(--shadow)]"
          >
            <div className="flex items-center gap-3 px-5 pb-3 pt-5">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: '#232019' }}
              >
                <span style={{ fontFamily: 'var(--font-serif)', color: '#F7F2E7', fontWeight: 700, fontSize: 18 }}>M</span>
              </div>
              <h2 className="flex-1 text-[15px] font-semibold">发现新版本</h2>
              {installing ? null : (
                <button
                  onClick={onDismiss}
                  aria-label="关闭"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--accent)]">
                  v{state.latestVersion}
                </span>
                <span className="text-[12px] text-[var(--faint)]">当前版本 v{state.currentVersion}，新版本已可用。</span>
              </div>

              {state.notes ? (
                <div className="mt-4 border-t border-[var(--line)] pt-3">
                  <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">更新内容</p>
                  <div className="thin-scroll max-h-[220px] overflow-y-auto pr-1">
                    <ReleaseNotes text={state.notes} />
                  </div>
                </div>
              ) : null}
            </div>

            {installing ? (
              <div className="px-5 pt-4">
                <div className="h-1 overflow-hidden rounded-full bg-[var(--line)]">
                  <motion.div
                    className="h-full rounded-full bg-[var(--accent)]"
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] text-[var(--faint)]">
                  {progress?.phase === 'downloaded' ? '下载完成，正在重启安装…' : `正在下载 ${percent}%`}
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-4">
              {installing ? null : (
                <>
                  <button
                    onClick={onDismiss}
                    className="h-8 rounded-lg px-3 text-[12px] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => state.latestVersion && onSkip(state.latestVersion)}
                    className="h-8 rounded-lg px-3 text-[12px] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  >
                    跳过此版本
                  </button>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => {
                      setProgress({ phase: 'downloading', currentVersion: state.currentVersion, progress: 0 });
                      void window.memex.update.install();
                    }}
                  >
                    <Download size={13} /> 立即更新
                  </Button>
                </>
              )}
              {installing && progress?.phase === 'downloaded' ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--faint)]">
                  <RefreshCw size={12} className="animate-spin" /> 即将重启
                </span>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
