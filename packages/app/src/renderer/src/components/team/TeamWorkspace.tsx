import { useEffect, useState } from 'react';
import { useTeamStore } from '../../store/useTeamStore';
import { TeamAuthPanel } from './TeamAuthPanel';
import { TeamManagement } from './TeamManagement';
import { TeamNotificationCenter } from './TeamNotificationCenter';
import { TeamSyncBanner } from './TeamSyncBanner';
import { TeamTaskDetail } from './TeamTaskDetail';
import { TeamTaskList } from './TeamTaskList';

export function TeamWorkspace() {
  const { session, team, bootstrap, syncNow } = useTeamStore();
  const [managementOpen, setManagementOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!session.teamId) return;

    const timer = window.setInterval(() => void syncNow(), 30_000);
    const onOnline = () => void syncNow();
    window.addEventListener('online', onOnline);
    const unsubscribe = window.memex.team.onSyncState((state) =>
      useTeamStore.setState({ syncState: state }),
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      unsubscribe();
    };
  }, [session.teamId, syncNow]);

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
