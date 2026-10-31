import { useEffect, useState } from 'react';
import { useTeamStore } from '../../store/useTeamStore';
import { TeamAuthPanel } from './TeamAuthPanel';
import { TeamManagement } from './TeamManagement';
import { TeamNotificationCenter } from './TeamNotificationCenter';
import { TeamSyncBanner } from './TeamSyncBanner';
import { TeamTaskDetail } from './TeamTaskDetail';
import { TeamTaskList } from './TeamTaskList';

export function TeamWorkspace() {
  const { session, team, loading, bootstrap, syncNow } = useTeamStore();
  const [managementOpen, setManagementOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!session.teamId) return;

    const timer = window.setInterval(() => void syncNow(), 30_000);
    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session.teamId, syncNow]);

  if (loading && !team) {
    return (
      <section
        role="status"
        aria-live="polite"
        className="flex flex-1 items-center justify-center bg-[var(--surface)] text-[12px] text-[var(--muted)]"
      >
        正在加载团队空间…
      </section>
    );
  }

  if (!session.signedIn || !team) return <TeamAuthPanel />;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TeamSyncBanner />
      <div className="flex min-h-0 flex-1">
        <TeamTaskList
          onOpenManagement={() => setManagementOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />
        <TeamTaskDetail />
      </div>
      <TeamManagement open={managementOpen} onClose={() => setManagementOpen(false)} />
      <TeamNotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
