import { describe, expect, it } from 'vitest';
import { teamTaskUpdateSchema } from '../index.js';

describe('team task update schema', () => {
  it('requires an actual update field besides expectedVersion', () => {
    expect(teamTaskUpdateSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(teamTaskUpdateSchema.safeParse({ expectedVersion: 1, title: '更新后的标题' }).success).toBe(true);
  });
});
