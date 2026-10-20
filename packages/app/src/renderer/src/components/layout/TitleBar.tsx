import { PanelLeft, Search, Settings2 } from 'lucide-react';
import { Kbd } from '../ui/kbd';

interface TitleBarProps {
  onSearch: () => void;
  onSettings: () => void;
  onToggleSidebar: () => void;
}

export function TitleBar({ onSearch, onSettings, onToggleSidebar }: TitleBarProps) {
  return (
    <header className="app-region-drag flex h-10 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg)] pr-36 pl-3">
      <div className="app-region-no-drag flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          title="折叠侧栏"
        >
          <PanelLeft size={15} />
        </button>
        <div className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[var(--ink)] font-serif text-[13px] font-semibold text-[var(--bg)] shadow-sm">
          M
        </div>
        <span className="text-[13px] font-semibold tracking-tight">Memex</span>
      </div>

      <div className="app-region-no-drag mx-auto w-full max-w-[420px]">
        <button
          onClick={onSearch}
          className="group flex h-7 w-full items-center gap-2 rounded-lg border border-transparent px-2.5 text-left text-xs text-[var(--faint)] transition hover:border-[var(--line)] hover:bg-[var(--surface)]"
        >
          <Search size={13} />
          <span className="flex-1">搜索任务与笔记…</span>
          <span className="flex items-center gap-1">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="app-region-no-drag flex items-center gap-1">
        <button
          onClick={onSettings}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          title="设置"
        >
          <Settings2 size={15} />
        </button>
      </div>
    </header>
  );
}
