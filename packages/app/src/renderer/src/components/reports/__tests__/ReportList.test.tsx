import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MemexApi, Report, ReportSummary } from '@memex/shared';
import { ReportList } from '../ReportList';
import { useReportStore } from '../../../store/useReportStore';

const summary: ReportSummary = {
  id: '00000000-0000-4000-8000-000000000010',
  title: '2026-10-13 至 2026-10-19 周报',
  periodStart: new Date(2026, 9, 13).getTime(),
  periodEnd: new Date(2026, 9, 20).getTime(),
  templateId: '00000000-0000-4000-8000-000000000001',
  templateName: '默认周报模板',
  taskCount: 2,
  noteCount: 1,
  createdAt: new Date(2026, 9, 20, 12).getTime(),
  updatedAt: new Date(2026, 9, 20, 12).getTime(),
};

const report: Report = {
  ...summary,
  template: {
    name: '默认周报模板',
    description: null,
    basePrompt: '总结',
    sections: [{ id: 'done', title: '本周完成', instruction: '', allowEmpty: false }],
    constraints: '',
  },
  tasks: [],
  notes: [],
  contentMarkdown: '# 周报',
  generationMeta: {
    model: 'model-a',
    baseUrl: 'https://api.example.com/v1',
    generatedAt: summary.createdAt,
    durationMs: 100,
    promptChars: 100,
  },
};

beforeEach(() => {
  useReportStore.setState({
    tab: 'reports',
    reports: [],
    templates: [],
    activeReport: null,
    activeTemplateId: null,
    mode: 'empty',
    loading: false,
    error: null,
  });
  window.memex = {
    reports: {
      list: vi.fn().mockResolvedValue([summary]),
      get: vi.fn().mockResolvedValue(report),
    },
    templates: {
      list: vi.fn().mockResolvedValue([]),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
});

describe('report list', () => {
  it('renders report summaries and opens the selected report', async () => {
    render(<ReportList />);
    expect(await screen.findByText('2026-10-13 至 2026-10-19 周报')).not.toBeNull();
    expect(screen.getByText('默认周报模板')).not.toBeNull();
    fireEvent.click(screen.getByText('2026-10-13 至 2026-10-19 周报'));
    await waitFor(() => expect(window.memex.reports.get).toHaveBeenCalledWith(report.id));
    expect(useReportStore.getState().activeReport?.id).toBe(report.id);
  });
});

