import { useState } from 'react';
import { RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { useTeamStore } from '../../store/useTeamStore';

export function TeamSyncBanner() {
  const { syncState, outboxFailures, syncNow, retryOutbox, discardOutbox } = useTeamStore();
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState('');

  if (syncState.phase === 'idle' && syncState.pendingCount === 0 && outboxFailures.length === 0) return null;

  const runAction = async (action: () => Promise<void>) => {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await syncNow();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11px] text-[var(--muted)]">
      <div className="flex items-center gap-2 px-3 py-1.5">
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
          <button
            disabled={retrying}
            aria-busy={retrying}
            onClick={() => void retry()}
            className="text-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
          >
            重试
          </button>
        ) : null}
      </div>
      {outboxFailures.length > 0 ? (
        <div className="space-y-1 border-t border-[var(--line)] px-3 py-2">
          {outboxFailures.map((failure) => (
            <div key={failure.id} className="flex items-center gap-2 rounded-md bg-[var(--surface)] px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--ink)]">{failure.type}</p>
                <p className="truncate text-red-600">{failure.lastError ?? '同步失败'}</p>
              </div>
              <span className="shrink-0 text-[var(--faint)]">尝试 {failure.attempts} 次</span>
              <button
                aria-label={`重试失败操作-${failure.id}`}
                onClick={() => void runAction(() => retryOutbox(failure.id))}
                className="text-[var(--accent)]"
              >
                重试
              </button>
              <button
                aria-label={`丢弃失败操作-${failure.id}`}
                onClick={() => void runAction(() => discardOutbox(failure.id))}
                className="text-red-600"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="px-3 pb-2 text-red-600">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
