import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeamRealtime {
  watch(teamId: string, onChange: () => void): void;
  stop(): void;
}

export function createTeamRealtime(supabase: SupabaseClient): TeamRealtime {
  let channel: ReturnType<SupabaseClient['channel']> | null = null;
  let currentTeamId = '';

  return {
    watch(teamId, onChange) {
      if (channel && currentTeamId === teamId) return;
      if (channel) void supabase.removeChannel(channel);
      currentTeamId = teamId;
      channel = supabase.channel(`team:${teamId}`);
      for (const table of [
        'team_tasks',
        'team_task_assignees',
        'team_task_progress_notes',
        'team_task_events',
        'team_notifications',
      ]) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `team_id=eq.${teamId}` },
          onChange,
        );
      }
      channel.subscribe();
    },
    stop() {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      currentTeamId = '';
    },
  };
}
