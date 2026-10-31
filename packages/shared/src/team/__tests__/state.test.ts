import { describe, expect, it } from 'vitest';
import {
  canApproveAssignee,
  canSeeTeamTask,
  deriveTeamTaskState,
  hasNonAssigneeApprover,
  type TeamTask,
} from '../index.js';

function task(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task-1',
    teamId: 'team-1',
    title: '交付方案',
    description: null,
    descriptionJson: null,
    priority: 'medium',
    dueAt: null,
    tags: [],
    createdBy: 'leader-creator',
    archivedAt: null,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    leaders: [
      { id: 'leader-creator', email: 'creator@example.com', displayName: '创建者' },
      { id: 'leader-2', email: 'leader2@example.com', displayName: '领导二' },
    ],
    assignees: [
      {
        id: 'member-1',
        email: 'member1@example.com',
        displayName: '成员一',
        status: 'doing',
        latestNote: '处理中',
        approvedBy: null,
        approvedAt: null,
        version: 1,
      },
    ],
    ...overrides,
  };
}

describe('team task state', () => {
  it('is in progress until every assignee is approved', () => {
    expect(deriveTeamTaskState(task())).toBe('in_progress');
    expect(
      deriveTeamTaskState(task({ assignees: [{ ...task().assignees[0]!, status: 'approved' }] })),
    ).toBe('completed');
  });

  it('marks a task ended when closed items coexist with approved items', () => {
    const base = task().assignees[0]!;
    expect(
      deriveTeamTaskState(
        task({
          assignees: [
            { ...base, id: 'member-1', status: 'approved' },
            { ...base, id: 'member-2', status: 'closed' },
          ],
        }),
      ),
    ).toBe('ended_with_closed');
  });

  it('marks archived tasks as archived regardless of assignee status', () => {
    expect(
      deriveTeamTaskState(
        task({
          archivedAt: 2,
          assignees: [{ ...task().assignees[0]!, status: 'approved' }],
        }),
      ),
    ).toBe('archived');
  });

  it('lets the creator or task leader approve another person', () => {
    const value = task();
    expect(canApproveAssignee(value, 'leader-creator', 'member-1', ['leader-creator', 'leader-2'])).toBe(true);
    expect(canApproveAssignee(value, 'leader-2', 'member-1', ['leader-creator', 'leader-2'])).toBe(true);
    expect(canApproveAssignee(value, 'member-1', 'member-1', ['leader-creator', 'leader-2'])).toBe(false);
  });

  it('never lets a leader approve their own assignee item', () => {
    const value = task({
      assignees: [{ ...task().assignees[0]!, id: 'leader-2' }],
    });
    expect(canApproveAssignee(value, 'leader-2', 'leader-2', ['leader-creator', 'leader-2'])).toBe(false);
  });

  it('lets a leader assigned to one item approve another assignee item', () => {
    const base = task().assignees[0]!;
    const value = task({
      assignees: [
        { ...base, id: 'leader-2', email: 'leader2@example.com', displayName: '领导二' },
        { ...base, id: 'member-1' },
      ],
    });
    expect(canApproveAssignee(value, 'leader-2', 'member-1', ['leader-creator', 'leader-2'])).toBe(true);
  });

  it('rejects an inactive leader', () => {
    expect(canApproveAssignee(task(), 'leader-2', 'member-1', ['leader-creator'])).toBe(false);
  });

  it('requires at least one approver outside the assignee list', () => {
    expect(hasNonAssigneeApprover(['member-1'], ['leader-creator'])).toBe(true);
    expect(hasNonAssigneeApprover(['leader-creator'], ['leader-creator'])).toBe(false);
    expect(hasNonAssigneeApprover(['leader-creator'], ['leader-2'])).toBe(true);
  });

  it('limits member visibility to assigned tasks', () => {
    expect(canSeeTeamTask(task(), 'member-1', 'member')).toBe(true);
    expect(canSeeTeamTask(task(), 'member-2', 'member')).toBe(false);
    expect(canSeeTeamTask(task(), 'leader-2', 'leader')).toBe(true);
  });
});
