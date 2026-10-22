import { randomUUID } from 'node:crypto';
import type { MemexDatabase } from '../db/database.js';
import { reportTemplateCreateSchema, reportTemplateUpdateSchema } from '../reports/validation.js';
import type { ReportTemplate, ReportTemplateInput, ReportTemplatePatch, ReportTemplateSection } from '../reports/types.js';

interface ReportTemplateRow {
  id: string;
  name: string;
  description: string | null;
  base_prompt: string;
  sections_json: string;
  constraints: string;
  is_builtin: number;
  created_at: number;
  updated_at: number;
}

export interface ReportTemplateRepository {
  list(): ReportTemplate[];
  get(id: string): ReportTemplate | null;
  create(input: ReportTemplateInput): ReportTemplate;
  update(id: string, patch: ReportTemplatePatch): ReportTemplate;
  remove(id: string): void;
}

function mapTemplate(row: ReportTemplateRow): ReportTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrompt: row.base_prompt,
    sections: JSON.parse(row.sections_json) as ReportTemplateSection[],
    constraints: row.constraints,
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isDuplicateNameError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: report_templates.name');
}

export function createReportTemplateRepository(db: MemexDatabase): ReportTemplateRepository {
  const get = (id: string): ReportTemplate | null => {
    const row = db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as unknown as ReportTemplateRow | undefined;
    return row ? mapTemplate(row) : null;
  };

  const ensureNameAvailable = (name: string, exceptId?: string): void => {
    const row = db
      .prepare('SELECT id FROM report_templates WHERE name = ? AND (? IS NULL OR id <> ?)')
      .get(name, exceptId ?? null, exceptId ?? null) as { id: string } | undefined;
    if (row) throw new Error('模板名称已存在');
  };

  return {
    list() {
      const rows = db
        .prepare('SELECT * FROM report_templates ORDER BY is_builtin ASC, updated_at DESC, created_at DESC')
        .all() as unknown as ReportTemplateRow[];
      return rows.map(mapTemplate);
    },

    get,

    create(input) {
      const value = reportTemplateCreateSchema.parse(input);
      const id = randomUUID();
      const now = Date.now();
      const description = value.description ?? null;
      const constraints = value.constraints ?? '';
      ensureNameAvailable(value.name);

      try {
        db.prepare(`
          INSERT INTO report_templates(
            id, name, description, base_prompt, sections_json, constraints, is_builtin, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(id, value.name, description, value.basePrompt, JSON.stringify(value.sections), constraints, now, now);
      } catch (error) {
        if (isDuplicateNameError(error)) throw new Error('模板名称已存在');
        throw error;
      }

      return get(id)!;
    },

    update(id, patch) {
      const existing = get(id);
      if (!existing) throw new Error('模板不存在');
      if (existing.isBuiltin) throw new Error('内置模板不能修改');

      const value = reportTemplateUpdateSchema.parse(patch);
      if (value.name !== undefined) ensureNameAvailable(value.name, id);

      const assignments: string[] = [];
      const params: (string | number | null)[] = [];
      const assign = (column: string, next: string | null): void => {
        assignments.push(`${column} = ?`);
        params.push(next);
      };

      if (value.name !== undefined) assign('name', value.name);
      if (value.description !== undefined) assign('description', value.description ?? null);
      if (value.basePrompt !== undefined) assign('base_prompt', value.basePrompt);
      if (value.sections !== undefined) assign('sections_json', JSON.stringify(value.sections));
      if (value.constraints !== undefined) assign('constraints', value.constraints);
      assignments.push('updated_at = ?');
      params.push(Date.now(), id);

      try {
        db.prepare(`UPDATE report_templates SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
      } catch (error) {
        if (isDuplicateNameError(error)) throw new Error('模板名称已存在');
        throw error;
      }

      return get(id)!;
    },

    remove(id) {
      const existing = get(id);
      if (!existing) throw new Error('模板不存在');
      if (existing.isBuiltin) throw new Error('内置模板不能删除');
      db.prepare('DELETE FROM report_templates WHERE id = ?').run(id);
    },
  };
}
