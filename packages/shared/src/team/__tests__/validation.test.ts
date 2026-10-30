import { describe, expect, it } from 'vitest';
import { teamSubmitSchema, teamTaskUpdateSchema } from '../index.js';

describe('team task update schema', () => {
  it('requires an actual update field besides expectedVersion', () => {
    expect(teamTaskUpdateSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(teamTaskUpdateSchema.safeParse({ expectedVersion: 1, title: '更新后的标题' }).success).toBe(true);
  });
});

describe('team submit schema', () => {
  it('requires a non-empty submission note', () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    expect(teamSubmitSchema.safeParse({ taskId, expectedVersion: 2, note: '   ' }).success).toBe(false);
    expect(teamSubmitSchema.safeParse({ taskId, expectedVersion: 2 }).success).toBe(false);
    expect(teamSubmitSchema.safeParse({ taskId, expectedVersion: 2, note: '请验收' }).success).toBe(true);
  });
});
