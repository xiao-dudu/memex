import { useMemo } from 'react';
import { ChevronsDownUp, FilePlus2, Pin, SearchX, StickyNote } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { NoteView } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { relativeTime } from '../../lib/date';

const VIEW_TITLES: Record<NoteView, string> = { all: '全部笔记', pinned: '置顶', trash: '回收站' };

export function NoteList() {
  const { notes, noteView, activeNote, loading, selectNote, createNote, togglePin, setListCollapsed, detailCollapsed } = useAppStore();

  const summary = useMemo(() => {
    if (noteView === 'trash') return '删除的笔记会保留 30 天';
    return `${notes.length} 条笔记 · 本地保存`;
  }, [noteView, notes.length]);

  return (
    <section className={cn(
        'flex flex-col border-r border-[var(--line)] bg-[var(--surface)]',
        detailCollapsed ? 'min-w-0 flex-1' : 'w-[var(--rail-list)] shrink-0',
      )}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line)] px-4" title={summary}>
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{VIEW_TITLES[noteView]}</h1>
        <span className="rounded-md bg-[var(--hover)] px-2 py-0.5 text-[12px] tabular-nums text-[var(--muted)]">{notes.length}</span>
        <span className="flex-1" />
        {!detailCollapsed ? (
          <button
            onClick={() => setListCollapsed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            title="折叠列表"
          >
            <ChevronsDownUp size={14} />
          </button>
        ) : null}
      </header>

      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-3">
        <Button variant="soft" size="sm" className="h-7 flex-1 justify-start text-[12px]" onClick={() => void createNote()}>
          <FilePlus2 size={13} /> 新建笔记
        </Button>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-4 pt-1">
        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-[82px] animate-pulse rounded-xl bg-[var(--hover)]" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-sm">
              {noteView === 'trash' ? <SearchX size={20} /> : <StickyNote size={20} />}
            </div>
            <p className="text-[13px] font-medium">{noteView === 'trash' ? '回收站是空的' : '还没有笔记'}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--faint)]">
              {noteView === 'trash' ? '删除的笔记会在这里保留 30 天。' : '把想法、会议记录和参考资料放在这里。'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {notes.map((note) => (
              <motion.button
                layout="position"
                key={note.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                onClick={() => void selectNote(note.id)}
                className={cn(
                  'group mb-0.5 flex w-full flex-col gap-1 rounded-xl px-3 py-3 text-left transition-colors',
                  activeNote?.id === note.id ? 'bg-[var(--surface-2)] shadow-sm ring-1 ring-[var(--line)]' : 'hover:bg-[var(--hover)]',
                )}
              >
                <div className="flex items-center gap-2">
                  {note.isPinned ? <Pin size={11} className="shrink-0 fill-[var(--accent)] text-[var(--accent)]" /> : null}
                  <span className={cn('truncate text-[13px] font-medium', note.deletedAt ? 'text-[var(--faint)]' : 'text-[var(--ink)]')}>
                    {note.title}
                  </span>
                  <span className="ml-auto shrink-0 text-[12px] text-[var(--faint)]">{relativeTime(note.updatedAt)}</span>
                </div>
                <p className="line-clamp-2 text-[12px] leading-[1.55] text-[var(--faint)]">{note.excerpt || '空白笔记'}</p>
                <div className="mt-1 flex items-center gap-2">
                  {note.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[12px] text-[var(--muted)]">
                      {tag}
                    </span>
                  ))}
                  <span className="flex-1" />
                  {noteView !== 'trash' ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        void togglePin(note);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation();
                          void togglePin(note);
                        }
                      }}
                      className={cn(
                        'rounded-md p-0.5 text-[var(--faint)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--accent)]',
                        note.isPinned ? 'opacity-100 text-[var(--accent)]' : '',
                      )}
                      title={note.isPinned ? '取消置顶' : '置顶'}
                    >
                      <Pin size={11} />
                    </span>
                  ) : null}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>

      <footer className="flex h-9 shrink-0 items-center border-t border-[var(--line)] px-4 text-[12px] text-[var(--faint)]">
        <span>自动保存已开启</span>
        <span className="flex-1" />
        <span>Ctrl+K 搜索</span>
      </footer>
    </section>
  );
}
