import { z } from 'zod';

export const taskStatusSchema = z.enum(['todo', 'doing', 'done']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);
export const taskViewSchema = z.enum(['inbox', 'today', 'upcoming', 'done', 'trash']);
export const noteViewSchema = z.enum(['all', 'pinned', 'trash']);
export const themeSchema = z.enum(['system', 'light', 'dark']);
export const mcpAccessSchema = z.enum(['tasks', 'all']);

const titleSchema = z.string().trim().min(1, '标题不能为空').max(200, '标题最多 200 个字符');
const tagSchema = z.string().trim().min(1).max(40);
const tagListSchema = z.array(tagSchema).max(20).optional();

export const taskCreateSchema = z.object({
  title: titleSchema,
  description: z.string().max(20000).nullish(),
  descriptionJson: z.string().max(200_000).nullish(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: z.number().int().nonnegative().nullish(),
  noteId: z.string().uuid().nullish(),
  tags: tagListSchema,
});

export const taskUpdateSchema = z.object({
  title: titleSchema.optional(),
  description: z.string().max(20000).nullish(),
  descriptionJson: z.string().max(200_000).nullish(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: z.number().int().nonnegative().nullish(),
  noteId: z.string().uuid().nullish(),
  tags: tagListSchema,
}).refine((value) => Object.keys(value).length > 0, { message: '至少提供一个字段' });

export const taskFilterSchema = z.object({
  view: taskViewSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  tag: z.string().max(40).optional(),
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

export const noteCreateSchema = z.object({
  contentJson: z.string().min(1).max(2_000_000),
  plainText: z.string().max(1_000_000),
  title: z.string().trim().max(200).optional(),
  isPinned: z.boolean().optional(),
  tags: tagListSchema,
});

export const noteUpdateSchema = z.object({
  contentJson: z.string().min(1).max(2_000_000).optional(),
  plainText: z.string().max(1_000_000).optional(),
  title: z.string().trim().max(200).optional(),
  isPinned: z.boolean().optional(),
  tags: tagListSchema,
}).refine((value) => Object.keys(value).length > 0, { message: '至少提供一个字段' });

export const noteFilterSchema = z.object({
  view: noteViewSchema.optional(),
  tag: z.string().max(40).optional(),
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

export const settingsPatchSchema = z.object({
  mcpAccessMode: mcpAccessSchema.optional(),
  mcpTaskWrite: z.boolean().optional(),
  mcpNoteWrite: z.boolean().optional(),
  closeToTray: z.boolean().optional(),
  autoLaunch: z.boolean().optional(),
  quickCaptureHideOnBlur: z.boolean().optional(),
  theme: themeSchema.optional(),
});

export const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(100).optional(),
});

export function deriveNoteTitle(plainText: string): string {
  const firstLine = plainText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return '无标题';
  return firstLine.slice(0, 120);
}
