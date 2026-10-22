import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MemexApi, Report, ReportCandidate, ReportTemplate } from '@memex/shared';
import { NewReportWizard } from '../NewReportWizard';
import { useReportStore } from '../../../store/useReportStore';
import { useAppStore } from '../../../store/useAppStore';

const template: ReportTemplate = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '默认周报模板',
  description: '通用周报',
  basePrompt: '总结本周工作',
  sections: [{ id: 'done', title: '本周完成', instruction: '', allowEmpty: false }],
  constraints: '',
  isBuiltin: true,
  createdAt: 1,
  updatedAt: 1,
};

const taskA: ReportCandidate = {
  id: '00000000-0000-4000-8000-000000000011',
  title: '任务 A',
  description: null,
  status: 'done',
  priority: 'medium',
  dueAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  completedAt: Date.now(),
  tags: [],
  noteId: null,
  noteTitle: null,
};

const taskB: ReportCandidate = {
  ...taskA,
  id: '00000000-0000-4000-8000-000000000012',
  title: '任务 B',
  status: 'todo',
  completedAt: null,
};

const savedReport: Report = {
  id: '00000000-0000-4000-8000-000000000013',
  title: '2026-10-16 至 2026-10-22 周报',
  periodStart: new Date(2026, 9, 16).getTime(),
  periodEnd: new Date(2026, 9, 23).getTime(),
  templateId: template.id,
  template: {
    name: template.name,
    description: template.description,
    basePrompt: template.basePrompt,
    sections: template.sections,
    constraints: template.constraints,
  },
  tasks: [],
  notes: [],
  contentMarkdown: '# 周报',
  generationMeta: {
    model: 'model-a',
    baseUrl: 'https://api.example.com/v1',
    generatedAt: Date.now(),
    durationMs: 100,
    promptChars: 100,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

beforeEach(() => {
  useAppStore.setState({ settingsOpen: false });
  useReportStore.setState({
    tab: 'reports',
    reports: [],
    templates: [template],
    activeReport: null,
    activeTemplateId: null,
    mode: 'new',
    loading: false,
    error: null,
  });
  window.memex = {
    ai: {
      getConfig: vi.fn().mockResolvedValue({ baseUrl: 'https://api.example.com/v1', model: 'model-a', hasApiKey: true }),
    },
    reports: {
      candidates: vi.fn().mockResolvedValue([taskA, taskB]),
      generate: vi.fn().mockResolvedValue(savedReport),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as MemexApi;
});

afterEach(() => {
  cleanup();
});

describe('new report wizard', () => {
  it('refreshes AI configuration after settings closes', async () => {
    const getConfig = vi
      .fn()
      .mockResolvedValueOnce({ baseUrl: '', model: '', hasApiKey: false })
      .mockResolvedValueOnce({ baseUrl: 'https://new.example.com/v1', model: 'new-model', hasApiKey: false });
    window.memex.ai.getConfig = getConfig;
    render(<NewReportWizard />);
    await waitFor(() => expect(screen.getByText(/尚未配置可用的 Base URL/)).not.toBeNull());

    await act(async () => {
      useAppStore.setState({ settingsOpen: true });
      await Promise.resolve();
    });
    await act(async () => {
      useAppStore.setState({ settingsOpen: false });
      await Promise.resolve();
    });

    expect(await screen.findByText(/new\.example\.com · new-model/)).not.toBeNull();
    expect(getConfig).toHaveBeenCalledTimes(2);
  });

  it('locks the period while candidates are loading to prevent stale ranges', async () => {
    let resolveCandidates!: (value: ReportCandidate[]) => void;
    (window.memex.reports.candidates as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<ReportCandidate[]>((resolve) => {
        resolveCandidates = resolve;
      }),
    );
    render(<NewReportWizard />);
    await screen.findByText(/发送服务：api\.example\.com/);
    fireEvent.click(screen.getByRole('button', { name: '加载任务' }));

    expect((screen.getByLabelText('开始日期') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('结束日期') as HTMLInputElement).disabled).toBe(true);
    await act(async () => {
      resolveCandidates([taskA]);
      await Promise.resolve();
    });
    await waitFor(() => expect((screen.getByLabelText('开始日期') as HTMLInputElement).disabled).toBe(false));
  });
  it('keeps a successfully committed report even if cancel was requested late', async () => {
    let resolveGenerate!: (value: Report) => void;
    (window.memex.reports.generate as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<Report>((resolve) => {
        resolveGenerate = resolve;
      }),
    );
    render(<NewReportWizard />);
    fireEvent.click(await screen.findByRole('button', { name: '加载任务' }));
    await screen.findByText('任务 A');
    fireEvent.click(screen.getByRole('button', { name: '生成周报' }));
    fireEvent.click(screen.getByRole('button', { name: '确认发送' }));
    await screen.findByText(/正在生成周报/);
    fireEvent.click(screen.getByRole('button', { name: '取消生成' }));
    resolveGenerate(savedReport);

    await waitFor(() => expect(useReportStore.getState().activeReport?.id).toBe(savedReport.id));
  });
  it('selects all candidates and excludes an unchecked task from generation', async () => {
    render(<NewReportWizard />);

    fireEvent.click(await screen.findByRole('button', { name: '加载任务' }));
    expect(await screen.findByText('任务 A')).not.toBeNull();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '生成周报' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByLabelText('选择 任务 B'));
    fireEvent.click(screen.getByRole('button', { name: '生成周报' }));
    expect(screen.getByText(/将发送 1 条任务、0 篇关联笔记到 api.example.com。/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认发送' }));

    await waitFor(() =>
      expect(window.memex.reports.generate).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: template.id, taskIds: [taskA.id], includeNotes: false }),
      ),
    );
    await waitFor(() => expect(useReportStore.getState().activeReport?.id).toBe(savedReport.id));
  });
});
