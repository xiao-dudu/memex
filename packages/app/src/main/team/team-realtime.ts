import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeamRealtime {
  watch(teamId: string, onChange: () => void): void;
  stop(): void;
}

export function createTeamRealtime(supabase: SupabaseClient): TeamRealtime {
  let channel: ReturnType<SupabaseClient['channel']> | null = null;
  let currentTeamId = '';
  let onChangeRef: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearPending = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChangeRef?.();
    }, 250);
  };

  return {
    watch(teamId, onChange) {
      onChangeRef = onChange;
      if (channel && currentTeamId === teamId) return;
      clearPending();
      if (channel) void supabase.removeChannel(channel);
      currentTeamId = teamId;
      channel = supabase.channel(`team:${teamId}`);
      for (const table of [
        'team_members',
        'team_tasks',
        'team_task_assignees',
        'team_task_progress_notes',
        'team_task_events',
        'team_notifications',
      ]) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `team_id=eq.${teamId}` },
          schedule,
        );
      }
      channel.subscribe();
    },
    stop() {
      clearPending();
      onChangeRef = null;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      currentTeamId = '';
    },
  };
}
