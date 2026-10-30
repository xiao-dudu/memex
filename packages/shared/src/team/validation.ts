import { z } from 'zod';

const uuid = z.string().uuid();
const title = z.string().trim().min(1, '标题不能为空').max(200, '标题最多 200 个字符');
const body = z.string().trim().min(1, '内容不能为空').max(20_000);
const tag = z.string().trim().min(1).max(40);
const tags = z.array(tag).max(20).optional();
const priority = z.enum(['low', 'medium', 'high']);

export const teamSignInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export const teamSignUpSchema = teamSignInSchema.extend({
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
});

export const teamCreateSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const teamJoinSchema = z.object({ token: z.string().trim().min(20).max(200) });
export const teamInviteCreateSchema = z.object({
  email: z.string().trim().email(),
  expiresInHours: z.number().int().min(1).max(720),
});
export const teamRolePatchSchema = z.object({
  userId: uuid,
  role: z.enum(['leader', 'member']),
});

export const teamTaskCreateSchema = z.object({
  title,
  description: z.string().max(20_000).nullish(),
  descriptionJson: z.string().max(200_000).nullish(),
  priority: priority.optional(),
  dueAt: z.number().int().nonnegative().nullish(),
  tags,
  assigneeIds: z.array(uuid).min(1).max(50),
  leaderIds: z.array(uuid).min(1).max(20),
});

export const teamTaskUpdateSchema = teamTaskCreateSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
}).refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), { message: '至少提供一个字段' });

export const teamTaskFilterSchema = z.object({
  view: z.enum(['all', 'mine', 'pending_review', 'overdue', 'archived']).optional(),
  memberId: uuid.optional(),
  status: z.enum(['todo', 'doing', 'submitted', 'approved', 'closed']).optional(),
  tag: z.string().max(40).optional(),
  query: z.string().max(200).optional(),
}).optional();

export const teamAssigneeActionSchema = z.object({
  taskId: uuid,
  expectedVersion: z.number().int().positive(),
  note: body.optional(),
});

export const teamSubmitSchema = z.object({
  taskId: uuid,
  expectedVersion: z.number().int().positive(),
  note: body,
});

export const teamReviewSchema = z.object({
  taskId: uuid,
  assigneeId: uuid,
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['approve', 'return']),
  note: body.optional(),
});
