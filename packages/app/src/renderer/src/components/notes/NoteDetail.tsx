import { FileText, Pin, RotateCcw, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/button';
import { NoteEditor } from './NoteEditor';
import { cn } from '../ui/utils';

export function NoteDetail() {
  const { activeNote, updateNote, deleteNote, restoreNote, purgeNote } = useAppStore();

  if (!activeNote) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg)] paper-grain">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-soft">
          <FileText size={22} />
        </div>
        <p className="text-[15px] font-medium">选择一条笔记</p>
        <p className="mt-1 text-[12px] text-[var(--faint)]">或者按 Ctrl+Shift+N 新建一条</p>
      </div>
    );
  }

  const note = activeNote;
  const isTrash = note.deletedAt !== null;

  return (
    <motion.section
      key={note.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]"
    >
      <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col px-12 py-8">
        <div className="mb-7 flex items-center gap-2">
          <div className="flex items-center gap-2 text-[12px] text-[var(--faint)]">
            <span>笔记</span>
            <span>/</span>
            <span>{new Date(note.updatedAt).toLocaleDateString('zh-CN')}</span>
          </div>
          <span className="flex-1" />
          {!isTrash ? (
            <button
              onClick={() => void updateNote(note.id, { isPinned: !note.isPinned })}
              className={cn(
                'flex h-7 items-center gap-2 rounded-md px-2 text-[12px] transition',
                note.isPinned ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
              )}
            >
              <Pin size={12} className={note.isPinned ? 'fill-current' : ''} />
              {note.isPinned ? '已置顶' : '置顶'}
            </button>
          ) : null}
        </div>

        <h1 className="mb-6 font-serif text-[32px] font-semibold leading-tight tracking-[-0.025em] text-[var(--ink)]">
          {note.title}
        </h1>

        <NoteEditor key={note.id} noteId={note.id} title={note.title} contentJson={note.contentJson} />

        <div className="mt-10 flex items-center gap-2 border-t border-[var(--line)] pt-4">
          <span className="text-[12px] text-[var(--faint)]">
            最后编辑 {new Date(note.updatedAt).toLocaleString('zh-CN', { hour12: false })}
          </span>
          <span className="flex-1" />
          {isTrash ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void restoreNote(note.id)}>
                <RotateCcw size={13} /> 恢复
              </Button>
              <Button variant="danger" size="sm" onClick={() => void purgeNote(note.id)}>
                <Trash2 size={13} /> 彻底删除
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="text-[var(--muted)] hover:text-red-500" onClick={() => void deleteNote(note.id)}>
              <Trash2 size={13} /> 移到回收站
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
