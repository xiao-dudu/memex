import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MemexApi, ReportTemplate } from '@memex/shared';
import { PromptPreview } from '../PromptPreview';
import { TemplateEditor } from '../TemplateEditor';
import { useReportStore } from '../../../store/useReportStore';

const builtin: ReportTemplate = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '默认周报模板',
  description: '通用周报',
  basePrompt: '总结本周工作',
  sections: [{ id: 'done', title: '本周完成', instruction: '列出结果', allowEmpty: false }],
  constraints: '不要编造数据',
  isBuiltin: true,
  createdAt: 1,
  updatedAt: 1,
};

const custom: ReportTemplate = {
  ...builtin,
  id: '00000000-0000-4000-8000-000000000002',
  name: '项目周报',
  isBuiltin: false,
};

beforeEach(() => {
  useReportStore.setState({
    tab: 'templates',
    reports: [],
    templates: [builtin, custom],
    activeReport: null,
    activeTemplateId: custom.id,
    mode: 'template',
    loading: false,
    error: null,
    wizardPrefill: null,
  });
  window.memex = {
    templates: {
      create: vi.fn().mockResolvedValue({
        ...builtin,
        id: '00000000-0000-4000-8000-000000000003',
        name: '默认周报模板（副本）',
        isBuiltin: false,
      }),
      update: vi.fn(),
      remove: vi.fn(),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
});

describe('template editor', () => {
  it('copies a built-in template before editing', async () => {
    render(<TemplateEditor template={builtin} />);
    expect(screen.getByText('内置模板不可直接修改')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '复制并编辑' }));
    await waitFor(() =>
      expect(window.memex.templates.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: '默认周报模板（副本）' }),
      ),
    );
  });

  it('can copy an existing custom template', async () => {
    render(<TemplateEditor template={custom} />);
    fireEvent.click(screen.getByRole('button', { name: '复制模板' }));
    await waitFor(() =>
      expect(window.memex.templates.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: '项目周报（副本）' }),
      ),
    );
  });

  it('keeps built-in allow-empty controls immutable', () => {
    render(<TemplateEditor template={builtin} />);
    expect((screen.getByLabelText('允许章节 1 为空') as HTMLButtonElement).disabled).toBe(true);
  });
  it('adds a section', () => {
    render(<TemplateEditor template={custom} />);
    fireEvent.click(screen.getByRole('button', { name: '添加章节' }));
    expect(screen.getAllByLabelText('章节标题')).toHaveLength(custom.sections.length + 1);
  });

  it('shows the shared fixed rules above the user template preview', () => {
    render(<PromptPreview template={custom} />);
    expect(screen.getByText('系统固定规则（只读）')).not.toBeNull();
    expect(screen.getByText(/不得虚构任务、成果、数据或完成情况/)).not.toBeNull();
    expect(screen.getByText('用户模板')).not.toBeNull();
    expect(screen.getByText(/项目周报/)).not.toBeNull();
  });
});
