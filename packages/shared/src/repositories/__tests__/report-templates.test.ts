import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createReportTemplateRepository, type ReportTemplateRepository } from '../report-templates.js';

let db: MemexDatabase;
let repo: ReportTemplateRepository;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-report-templates-')), 'test.db'));
  runMigrations(db);
  repo = createReportTemplateRepository(db);
});

const input = {
  name: '项目周报',
  basePrompt: '按项目总结',
  sections: [{ id: 'one', title: '进展', instruction: '说明进展', allowEmpty: false }],
  constraints: '不要发挥',
};

describe('report template repository', () => {
  it('lists the built-in template and creates a custom template', () => {
    expect(repo.list()).toHaveLength(1);
    const created = repo.create(input);
    expect(created.isBuiltin).toBe(false);
    expect(created.description).toBeNull();
    expect(created.sections).toEqual(input.sections);
    expect(repo.list()[0]?.name).toBe('项目周报');
  });

  it('rejects duplicate names and built-in mutation', () => {
    repo.create({ ...input, name: '重复' });
    expect(() => repo.create({ ...input, name: '重复' })).toThrow('模板名称已存在');
    const builtin = repo.list().find((item) => item.isBuiltin)!;
    expect(() => repo.update(builtin.id, { name: '修改' })).toThrow('内置模板不能修改');
    expect(() => repo.remove(builtin.id)).toThrow('内置模板不能删除');
  });

  it('updates and removes custom templates while preserving built-ins', () => {
    const created = repo.create(input);
    const updated = repo.update(created.id, { name: '更新后的模板', constraints: '保持简洁' });
    expect(updated.name).toBe('更新后的模板');
    expect(updated.constraints).toBe('保持简洁');
    expect(repo.get(created.id)?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

    repo.remove(created.id);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.list().map((item) => item.isBuiltin)).toEqual([true]);
  });

  it('reports missing templates and validates repository inputs', () => {
    expect(repo.get('00000000-0000-4000-8000-000000000099')).toBeNull();
    expect(() => repo.update('00000000-0000-4000-8000-000000000099', { name: '不存在' })).toThrow('模板不存在');
    expect(() => repo.remove('00000000-0000-4000-8000-000000000099')).toThrow('模板不存在');
    expect(() => repo.create({ ...input, name: ' ' })).toThrow();
  });

  it('rejects names used by another template on update', () => {
    const first = repo.create({ ...input, name: '第一个' });
    repo.create({ ...input, name: '第二个' });
    expect(() => repo.update(first.id, { name: '第二个' })).toThrow('模板名称已存在');
  });
});
