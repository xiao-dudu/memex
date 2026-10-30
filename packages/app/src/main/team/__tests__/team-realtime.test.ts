// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTeamRealtime } from '../team-realtime.js';

const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => {
  vi.useRealTimers();
});

describe('team realtime', () => {
  it('coalesces change bursts into one delayed callback', () => {
    vi.useFakeTimers();
    const handlers: Array<() => void> = [];
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, handler: () => void) => {
        handlers.push(handler);
        return channel;
      }),
      subscribe: vi.fn(),
    };
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    const realtime = createTeamRealtime(supabase as never);
    const onChange = vi.fn();

    realtime.watch(teamId, onChange);
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'team_members' }),
      expect.any(Function),
    );
    handlers[0]?.();
    handlers[1]?.();
    handlers[2]?.();
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    handlers[3]?.();
    vi.advanceTimersByTime(249);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    handlers[4]?.();
    realtime.stop();
    vi.advanceTimersByTime(250);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
