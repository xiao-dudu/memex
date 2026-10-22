import { z } from 'zod';

const sectionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(100),
  instruction: z.string().max(5_000),
  allowEmpty: z.boolean(),
});

const templateFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1_000).nullish(),
  basePrompt: z.string().trim().min(1).max(20_000),
  sections: z.array(sectionSchema).min(1).max(20),
  constraints: z.string().max(20_000).optional(),
};

export const reportTemplateCreateSchema = z.object(templateFields);

export const reportTemplateUpdateSchema = z
  .object({
    name: templateFields.name.optional(),
    description: templateFields.description,
    basePrompt: templateFields.basePrompt.optional(),
    sections: templateFields.sections.optional(),
    constraints: templateFields.constraints,
  })
  .refine((value) => Object.keys(value).length > 0, { message: '至少提供一个字段' });

export const reportCandidateQuerySchema = z
  .object({
    periodStart: z.number().int().nonnegative(),
    periodEnd: z.number().int().positive(),
  })
  .refine((value) => value.periodEnd > value.periodStart, { message: '结束时间必须晚于开始时间' });

export const reportGenerateSchema = z
  .object({
    periodStart: z.number().int().nonnegative(),
    periodEnd: z.number().int().positive(),
    templateId: z.string().uuid(),
    taskIds: z.array(z.string().uuid()).min(1).max(1_000),
    includeNotes: z.boolean(),
  })
  .refine((value) => value.periodEnd > value.periodStart, { message: '结束时间必须晚于开始时间' });

export const reportUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    contentMarkdown: z.string().max(2_000_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '至少提供一个字段' });

export const aiConfigPatchSchema = z
  .object({
    baseUrl: z.string().trim().max(2_000).optional(),
    model: z.string().trim().max(200).optional(),
    apiKey: z.string().max(10_000).optional(),
    clearApiKey: z.boolean().optional(),
    timeoutMs: z.number().int().min(5_000).max(300_000).optional(),
  })
  .refine((value) => !(value.apiKey && value.clearApiKey), { message: '不能同时设置和清除 API Key' });
