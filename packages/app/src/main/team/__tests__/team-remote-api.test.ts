// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTeamRemoteApi } from '../team-remote-api.js';

const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function taskRow(index: number) {
  return {
    id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    team_id: teamId,
    title: `任务 ${index}`,
    description: null,
    description_json: null,
    priority: 'medium',
    due_at: null,
    tags: [],
    created_by: '22222222-2222-4222-8222-222222222222',
    archived_at: null,
    version: 1,
    created_at: index,
    updated_at: index,
    sync_version: index,
  };
}

function fakeSupabase() {
  const rows: Record<string, Record<string, unknown>[]> = {
    teams: [{ id: teamId, name: '分页团队' }],
    team_members: [{
      team_id: teamId,
      user_id: '22222222-2222-4222-8222-222222222222',
      email: 'leader@example.com',
      display_name: '领导',
      role: 'leader',
      status: 'active',
      joined_at: 1,
      removed_at: null,
      sync_version: 1,
    }],
    team_tasks: [taskRow(1), taskRow(2), taskRow(3)],
    team_task_leaders: [],
    team_task_assignees: [],
    team_task_progress_notes: [],
    team_task_events: [],
    team_notifications: [],
    team_member_events: [],
  };
  const ranges: Record<string, Array<[number, number]>> = {};
  class Query {
    private table = '';
    private from = 0;
    private to = 0;
    select() { return this; }
    eq() { return this; }
    order() { return this; }
    range(from: number, to: number) {
      this.from = from;
      this.to = to;
      (ranges[this.table] ??= []).push([from, to]);
      return Promise.resolve({ data: rows[this.table]?.slice(from, to + 1) ?? [], error: null });
    }
    single() {
      return Promise.resolve({ data: rows[this.table]?.[0] ?? null, error: null });
    }
    then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
      return Promise.resolve({ data: rows[this.table] ?? [], error: null }).then(resolve);
    }
    constructor(table: string) { this.table = table; }
  }
  return {
    supabase: { from: (table: string) => new Query(table) } as unknown as SupabaseClient,
    ranges,
  };
}

describe('team remote api', () => {
  it('paginates every full snapshot table before marking the snapshot complete', async () => {
    const { supabase, ranges } = fakeSupabase();
    const api = createTeamRemoteApi(supabase, 2);

    const snapshot = await api.pullChanges(teamId, 0);

    expect(snapshot.tasks).toHaveLength(3);
    expect(snapshot.complete).toBe(true);
    expect(ranges.team_tasks).toEqual([[0, 1], [2, 3]]);
    for (const table of [
      'team_members',
      'team_task_leaders',
      'team_task_assignees',
      'team_task_progress_notes',
      'team_task_events',
      'team_member_events',
      'team_notifications',
    ]) {
      expect(ranges[table]).toEqual([[0, 1]]);
    }
  });
});
