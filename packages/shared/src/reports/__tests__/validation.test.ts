import { describe, expect, it } from 'vitest';
import { aiConfigPatchSchema, reportGenerateSchema, reportTemplateCreateSchema } from '../validation.js';

const validTemplate = {
  name: '研发周报',
  description: '研发团队使用',
  basePrompt: '用简洁专业的语气总结。',
  sections: [{ id: 'done', title: '本周完成', instruction: '列出结果和影响', allowEmpty: false }],
  constraints: '不要编造数据。',
};

describe('report validation', () => {
  it('accepts a valid template', () => {
    expect(reportTemplateCreateSchema.parse(validTemplate).name).toBe('研发周报');
  });

  it('rejects empty sections and inverted periods', () => {
    expect(() => reportTemplateCreateSchema.parse({ ...validTemplate, sections: [] })).toThrow();
    expect(() =>
      reportGenerateSchema.parse({
        periodStart: 200,
        periodEnd: 100,
        templateId: '00000000-0000-4000-8000-000000000001',
        taskIds: ['00000000-0000-4000-8000-000000000002'],
        includeNotes: false,
      }),
    ).toThrow();
  });

  it('bounds configurable AI request timeouts', () => {
    expect(aiConfigPatchSchema.safeParse({ timeoutMs: 5_000 }).success).toBe(true);
    expect(aiConfigPatchSchema.safeParse({ timeoutMs: 300_000 }).success).toBe(true);
    expect(aiConfigPatchSchema.safeParse({ timeoutMs: 4_999 }).success).toBe(false);
    expect(aiConfigPatchSchema.safeParse({ timeoutMs: 300_001 }).success).toBe(false);
  });
  it('rejects simultaneous API Key set and clear', () => {
    expect(() => aiConfigPatchSchema.parse({ apiKey: 'secret', clearApiKey: true })).toThrow();
  });
});
