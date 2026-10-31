import { RefreshCw, WifiOff } from 'lucide-react';
import { useTeamStore } from '../../store/useTeamStore';

export function TeamSyncBanner() {
  const { syncState, syncNow } = useTeamStore();

  if (syncState.phase === 'idle' && syncState.pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] text-[var(--muted)]">
      {syncState.phase === 'offline' ? (
        <WifiOff size={12} />
      ) : (
        <RefreshCw size={12} className={syncState.phase === 'syncing' ? 'animate-spin' : ''} />
      )}
      <span className="flex-1">
        {syncState.message ??
          (syncState.pendingCount > 0 ? `${syncState.pendingCount} 项等待同步` : '同步中…')}
      </span>
      {syncState.phase === 'error' || syncState.phase === 'offline' ? (
        <button onClick={() => void syncNow()} className="text-[var(--accent)]">
          重试
        </button>
      ) : null}
    </div>
  );
}
