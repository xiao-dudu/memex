import { useState } from 'react';
import type { TeamNotification } from '@memex/shared';
import { useTeamStore } from '../../store/useTeamStore';
import { Button } from '../ui/button';

interface Props {
  open: boolean;
  onClose(): void;
}

export function TeamNotificationCenter({ open, onClose }: Props) {
  const { notifications, markNotificationRead, selectTask } = useTeamStore();
  const [error, setError] = useState('');

  if (!open) return null;

  const openNotification = async (item: TeamNotification) => {
    setError('');
    try {
      await markNotificationRead(item.id);
      if (item.taskId) await selectTask(item.taskId);
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      role="dialog"
      aria-label="团队通知"
    >
      <div className="max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="flex items-center">
          <h2 className="text-base font-semibold">团队通知</h2>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-[12px] text-red-600">
            {error}
          </p>
        ) : null}
        <div className="mt-4 space-y-2">
          {notifications.map((item) => (
            <button
              key={item.id}
              className="w-full rounded-xl border border-[var(--line)] p-3 text-left"
              onClick={() => void openNotification(item)}
            >
              <div className="flex gap-2">
                <span className="text-[13px] font-medium">{item.title}</span>
                {item.readAt === null ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                ) : null}
              </div>
              <p className="mt-1 text-[12px] text-[var(--muted)]">{item.body}</p>
            </button>
          ))}
          {notifications.length === 0 ? (
            <p className="text-[12px] text-[var(--faint)]">暂无通知</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
