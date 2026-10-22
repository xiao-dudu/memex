import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MemexApi, Report } from '@memex/shared';
import { MarkdownPreview } from '../MarkdownPreview';
import { ReportDetail } from '../ReportDetail';
import { useReportStore } from '../../../store/useReportStore';

const report: Report = {
  id: '00000000-0000-4000-8000-000000000020',
  title: '2026-10-16 至 2026-10-22 周报',
  periodStart: new Date(2026, 9, 16).getTime(),
  periodEnd: new Date(2026, 9, 23).getTime(),
  templateId: '00000000-0000-4000-8000-000000000001',
  template: {
    name: '默认周报模板',
    description: null,
    basePrompt: '总结',
    sections: [{ id: 'done', title: '本周完成', instruction: '', allowEmpty: false }],
    constraints: '',
  },
  tasks: [],
  notes: [],
  contentMarkdown: '# 原内容',
  generationMeta: {
    model: 'model-a',
    baseUrl: 'https://api.example.com/v1',
    generatedAt: new Date(2026, 9, 22).getTime(),
    durationMs: 100,
    promptChars: 100,
  },
  createdAt: new Date(2026, 9, 22).getTime(),
  updatedAt: new Date(2026, 9, 22).getTime(),
};

beforeEach(() => {
  useReportStore.setState({
    tab: 'reports',
    reports: [],
    templates: [],
    activeReport: report,
    activeTemplateId: null,
    mode: 'report',
    loading: false,
    error: null,
    wizardPrefill: null,
  });
  window.memex = {
    reports: {
      update: vi.fn().mockResolvedValue({ ...report, contentMarkdown: '# 新内容' }),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('report detail', () => {
  it('debounces Markdown updates', async () => {
    vi.useFakeTimers();
    render(<ReportDetail report={report} />);
    fireEvent.change(screen.getByLabelText('Markdown 内容'), { target: { value: '# 新内容' } });
    await vi.advanceTimersByTimeAsync(500);
    expect(window.memex.reports.update).toHaveBeenCalledWith(report.id, { contentMarkdown: '# 新内容' });
  });

  it('does not render raw script tags', () => {
    const { container } = render(<MarkdownPreview value={'<script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('opens a new wizard draft prefilled from the saved report', () => {
    render(<ReportDetail report={report} />);
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));
    const state = useReportStore.getState();
    expect(state.mode).toBe('new');
    expect(state.wizardPrefill).toEqual({
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      templateId: report.templateId,
      taskIds: [],
      includeNotes: false,
    });
  });
  it('updates the preview immediately when switching views', async () => {
    render(<ReportDetail report={report} />);
    fireEvent.change(screen.getByLabelText('Markdown 内容'), { target: { value: '# 即时预览' } });
    await waitFor(() => expect(screen.getByText('保存中')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(screen.getByRole('heading', { name: '即时预览' })).not.toBeNull();
  });
});

