import { create } from 'zustand';
import type { Report, ReportSummary, ReportTemplate } from '@memex/shared';
import { useAppStore } from './useAppStore';

export type ReportMode = 'empty' | 'new' | 'report' | 'template';
export type ReportTab = 'reports' | 'templates';

interface ReportState {
  tab: ReportTab;
  reports: ReportSummary[];
  templates: ReportTemplate[];
  activeReport: Report | null;
  activeTemplateId: string | null;
  mode: ReportMode;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setTab: (tab: ReportTab) => void;
  selectReport: (id: string) => Promise<void>;
  setActiveReport: (report: Report) => void;
  startNewReport: () => void;
  selectTemplate: (id: string) => void;
  startNewTemplate: () => void;
  removeReport: (id: string) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useReportStore = create<ReportState>((set, get) => ({
  tab: 'reports',
  reports: [],
  templates: [],
  activeReport: null,
  activeTemplateId: null,
  mode: 'empty',
  loading: true,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [reports, templates] = await Promise.all([
        window.memex.reports.list(),
        window.memex.templates.list(),
      ]);
      set({ reports, templates, loading: false });
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
    }
  },

  setTab(tab) {
    const state = get();
    const mode: ReportMode =
      tab === 'reports'
        ? state.activeReport
          ? 'report'
          : 'empty'
        : state.activeTemplateId
          ? 'template'
          : 'empty';
    set({ tab, mode });
  },

  async selectReport(id) {
    try {
      const report = await window.memex.reports.get(id);
      if (!report) return;
      set({
        activeReport: report,
        activeTemplateId: null,
        mode: 'report',
        tab: 'reports',
        error: null,
      });
      useAppStore.getState().setListCollapsed(false);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  setActiveReport(report) {
    set({ activeReport: report, activeTemplateId: null, mode: 'report', tab: 'reports', error: null });
    void get().load();
  },

  startNewReport() {
    set({ tab: 'reports', mode: 'new', activeReport: null, error: null });
    useAppStore.getState().setListCollapsed(false);
  },

  selectTemplate(id) {
    set({ tab: 'templates', mode: 'template', activeTemplateId: id, activeReport: null, error: null });
    useAppStore.getState().setListCollapsed(false);
  },

  startNewTemplate() {
    set({ tab: 'templates', mode: 'template', activeTemplateId: null, activeReport: null, error: null });
    useAppStore.getState().setListCollapsed(false);
  },

  async removeReport(id) {
    try {
      await window.memex.reports.remove(id);
      const active = get().activeReport?.id === id;
      set({
        reports: get().reports.filter((report) => report.id !== id),
        activeReport: active ? null : get().activeReport,
        mode: active ? 'empty' : get().mode,
        error: null,
      });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },
}));

