import { create } from 'zustand';
import type { Report, ReportSummary, ReportTemplate } from '@memex/shared';
import { useAppStore } from './useAppStore';

export type ReportMode = 'empty' | 'new' | 'report' | 'template';
export type ReportTab = 'reports' | 'templates';

export interface ReportWizardPrefill {
  periodStart: number;
  periodEnd: number;
  templateId: string | null;
  taskIds: string[];
  includeNotes: boolean;
}

interface ReportState {
  tab: ReportTab;
  reports: ReportSummary[];
  templates: ReportTemplate[];
  activeReport: Report | null;
  activeTemplateId: string | null;
  mode: ReportMode;
  loading: boolean;
  error: string | null;
  wizardPrefill: ReportWizardPrefill | null;
  load: () => Promise<void>;
  setTab: (tab: ReportTab) => void;
  selectReport: (id: string) => Promise<void>;
  setActiveReport: (report: Report) => void;
  applyReport: (report: Report) => void;
  startNewReport: () => void;
  regenerateReport: (report: Report) => void;
  selectTemplate: (id: string) => void;
  startNewTemplate: () => void;
  upsertTemplate: (template: ReportTemplate) => void;
  removeTemplate: (id: string) => Promise<void>;
  removeReport: (id: string) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeReport(report: Report): ReportSummary {
  return {
    id: report.id,
    title: report.title,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    templateId: report.templateId,
    templateName: report.template.name,
    taskCount: report.tasks.length,
    noteCount: report.notes.length,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
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
  wizardPrefill: null,

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
        wizardPrefill: null,
      });
      useAppStore.getState().setListCollapsed(false);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  setActiveReport(report) {
    get().applyReport(report);
    void get().load();
  },

  applyReport(report) {
    const summary = summarizeReport(report);
    const exists = get().reports.some((item) => item.id === report.id);
    set({
      activeReport: report,
      reports: exists
        ? get().reports.map((item) => (item.id === report.id ? summary : item))
        : [summary, ...get().reports],
      activeTemplateId: null,
      mode: 'report',
      tab: 'reports',
      error: null,
    });
  },

  startNewReport() {
    set({ tab: 'reports', mode: 'new', activeReport: null, error: null, wizardPrefill: null });
    useAppStore.getState().setListCollapsed(false);
  },

  regenerateReport(report) {
    set({
      tab: 'reports',
      mode: 'new',
      activeReport: null,
      activeTemplateId: null,
      error: null,
      wizardPrefill: {
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        templateId: report.templateId,
        taskIds: report.tasks.map((task) => task.id),
        includeNotes: report.notes.length > 0,
      },
    });
    useAppStore.getState().setListCollapsed(false);
  },

  selectTemplate(id) {
    set({
      tab: 'templates',
      mode: 'template',
      activeTemplateId: id,
      activeReport: null,
      error: null,
      wizardPrefill: null,
    });
    useAppStore.getState().setListCollapsed(false);
  },

  startNewTemplate() {
    set({
      tab: 'templates',
      mode: 'template',
      activeTemplateId: null,
      activeReport: null,
      error: null,
      wizardPrefill: null,
    });
    useAppStore.getState().setListCollapsed(false);
  },

  upsertTemplate(template) {
    const exists = get().templates.some((item) => item.id === template.id);
    set({
      templates: exists
        ? get().templates.map((item) => (item.id === template.id ? template : item))
        : [template, ...get().templates],
      activeTemplateId: template.id,
      activeReport: null,
      mode: 'template',
      tab: 'templates',
      error: null,
    });
  },

  async removeTemplate(id) {
    try {
      await window.memex.templates.remove(id);
      const wasActive = get().activeTemplateId === id;
      set({
        templates: get().templates.filter((template) => template.id !== id),
        activeTemplateId: wasActive ? null : get().activeTemplateId,
        mode: wasActive ? 'empty' : get().mode,
        error: null,
      });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
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

