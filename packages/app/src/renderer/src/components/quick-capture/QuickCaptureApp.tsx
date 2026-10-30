import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CornerDownLeft, Loader2, StickyNote, X } from 'lucide-react';
import { motion } from 'motion/react';
import { textToDocument } from '../../lib/tiptap';
import { endOfToday } from '../../lib/date';
import { cn } from '../ui/utils';

type CaptureMode = 'task' | 'note';

export default function QuickCaptureApp() {
  const [mode, setMode] = useState<CaptureMode>('task');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = () => {
    window.setTimeout(() => inputRef.current?.focus(), 20);
  };

  useEffect(() => {
    void window.memex.settings.get().then((settings) => {
      document.documentElement.dataset.theme = settings.theme;
    });
    focusInput();
    window.addEventListener('focus', focusInput);
    return () => window.removeEventListener('focus', focusInput);
  }, []);

  const close = () => {
    setText('');
    setError('');
    void window.memex.window.hideQuickCapture();
  };

  const save = async (keepOpen: boolean) => {
    const clean = text.trim();
    if (!clean || saving) return;
    setSaving(true);
    setError('');
    try {
      if (mode === 'task') {
        await window.memex.tasks.create({ title: clean, dueAt: endOfToday() });
      } else {
        await window.memex.notes.create({ contentJson: textToDocument(clean), plainText: clean });
      }
      setText('');
      if (keepOpen) focusInput();
      else close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '2') {
        event.preventDefault();
        setMode((current) => (current === 'task' ? 'note' : 'task'));
        setText('');
        focusInput();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void save(event.ctrlKey || event.metaKey);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [text, mode, saving]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-full items-start justify-center p-2"
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/97 shadow-[var(--shadow)] backdrop-blur-xl">
        <div className="flex h-11 items-center gap-1 border-b border-[var(--line)] px-2.5">
          <button
            onClick={() => { setMode('task'); setText(''); focusInput(); }}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition',
              mode === 'task' ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]',
            )}
          >
            <CheckCircle2 size={13} /> 任务
          </button>
          <button
            onClick={() => { setMode('note'); setText(''); focusInput(); }}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition',
              mode === 'note' ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]',
            )}
          >
            <StickyNote size={13} /> 笔记
          </button>
          <span className="flex-1" />
          <span className="text-[9px] text-[var(--faint)]">Ctrl+2 切换</span>
          <button onClick={close} className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-[var(--faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]">
            <X size={13} />
          </button>
        </div>

        <div className="px-4 pb-3 pt-3">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={mode === 'task' ? 2 : 4}
            placeholder={mode === 'task' ? '记下一件要做的事…' : '随手写一段想法…'}
            className="w-full resize-none bg-transparent font-serif text-[17px] leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
          />
          <div className="mt-1 flex h-6 items-center gap-2">
            {error ? <span className="text-[9.5px] text-red-500">{error}</span> : null}
            <span className="flex-1" />
            {saving ? <Loader2 size={12} className="animate-spin text-[var(--faint)]" /> : null}
            <span className="flex items-center gap-1 text-[9px] text-[var(--faint)]">
              <CornerDownLeft size={10} /> 回车保存并关闭
            </span>
            <span className="text-[9px] text-[var(--faint)]">Ctrl+回车 继续记录</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
