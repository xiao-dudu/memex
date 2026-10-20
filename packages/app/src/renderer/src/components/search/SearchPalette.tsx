import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Search, StickyNote } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { SearchResults } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Kbd } from '../ui/kbd';
import { cn } from '../ui/utils';

type ResultItem =
  | { kind: 'task'; id: string; title: string; meta: string }
  | { kind: 'note'; id: string; title: string; meta: string };

export function SearchPalette() {
  const { searchOpen, setSearchOpen, openTask, openNote } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ tasks: [], notes: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    setQuery('');
    setResults({ tasks: [], notes: [] });
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const clean = query.trim();
    if (!clean) {
      setResults({ tasks: [], notes: [] });
      return;
    }
    const timer = window.setTimeout(() => {
      void window.memex.search(clean, 20).then((next) => {
        setResults(next);
        setActiveIndex(0);
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);

  const items = useMemo<ResultItem[]>(
    () => [
      ...results.tasks.map((task) => ({
        kind: 'task' as const,
        id: task.id,
        title: task.title,
        meta: task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办',
      })),
      ...results.notes.map((note) => ({
        kind: 'note' as const,
        id: note.id,
        title: note.title,
        meta: note.excerpt,
      })),
    ],
    [results],
  );

  const choose = (item: ResultItem | undefined) => {
    if (!item) return;
    setSearchOpen(false);
    if (item.kind === 'task') void openTask(item.id);
    else void openNote(item.id);
  };

  return (
    <AnimatePresence>
      {searchOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => setSearchOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] shadow-[var(--shadow)]"
          >
            <div className="flex h-12 items-center gap-2 border-b border-[var(--line)] px-4">
              <Search size={16} className="text-[var(--faint)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchOpen(false);
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, items.length - 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === 'Enter') choose(items[activeIndex]);
                }}
                placeholder="搜索任务与笔记…"
                className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--faint)]"
              />
              <Kbd>Esc</Kbd>
            </div>

            <div className="thin-scroll max-h-[52vh] overflow-y-auto p-2">
              {query.trim() === '' ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[12px] text-[var(--muted)]">输入关键词，同时搜索任务和笔记</p>
                  <p className="mt-1 text-[10.5px] text-[var(--faint)]">支持中文，结果会按类型分组</p>
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-[var(--faint)]">没有找到匹配内容</div>
              ) : (
                <>
                  <ResultGroup
                    label={`任务 · ${results.tasks.length}`}
                    items={items.filter((item) => item.kind === 'task')}
                    activeIndex={activeIndex}
                    offset={0}
                    onChoose={choose}
                  />
                  <ResultGroup
                    label={`笔记 · ${results.notes.length}`}
                    items={items.filter((item) => item.kind === 'note')}
                    activeIndex={activeIndex}
                    offset={results.tasks.length}
                    onChoose={choose}
                  />
                </>
              )}
            </div>

            <div className="flex h-8 items-center gap-3 border-t border-[var(--line)] px-4 text-[9.5px] text-[var(--faint)]">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> 选择</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> 打开</span>
              <span className="flex-1" />
              <span>统一搜索</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ResultGroup({
  label,
  items,
  activeIndex,
  offset,
  onChoose,
}: {
  label: string;
  items: ResultItem[];
  activeIndex: number;
  offset: number;
  onChoose: (item: ResultItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{label}</div>
      {items.map((item, index) => {
        const selected = activeIndex === offset + index;
        const Icon = item.kind === 'task' ? CheckCircle2 : StickyNote;
        return (
          <button
            key={`${item.kind}-${item.id}`}
            onMouseEnter={() => undefined}
            onClick={() => onChoose(item)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
              selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--hover)]',
            )}
          >
            <Icon size={14} className={item.kind === 'task' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-[var(--ink)]">{item.title}</p>
              <p className="truncate text-[10px] text-[var(--faint)]">{item.meta}</p>
            </div>
            <span className="text-[9.5px] text-[var(--faint)]">{item.kind === 'task' ? '任务' : '笔记'}</span>
          </button>
        );
      })}
    </div>
  );
}
