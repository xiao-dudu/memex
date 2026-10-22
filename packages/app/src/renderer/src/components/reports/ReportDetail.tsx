import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  PencilLine,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Report, ReportUpdateInput } from '@memex/shared';
import { useReportStore } from '../../store/useReportStore';
import { Button } from '../ui/button';
import { Input, Textarea } from '../ui/input';
import { cn } from '../ui/utils';
import { MarkdownPreview } from './MarkdownPreview';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type DetailView = 'edit' | 'preview';

interface ReportDetailProps {
  report: Report;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPeriod(report: Report): string {
  return `${formatDate(report.periodStart)} 至 ${formatDate(report.periodEnd - 1)}`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${formatDate(timestamp)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ReportDetail({ report }: ReportDetailProps) {
  const [title, setTitle] = useState(report.title);
  const [contentMarkdown, setContentMarkdown] = useState(report.contentMarkdown);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [view, setView] = useState<DetailView>('edit');
  const [exporting, setExporting] = useState<'markdown' | 'pdf' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const draftRef = useRef({ title, contentMarkdown });
  const persistedRef = useRef({ title: report.title, contentMarkdown: report.contentMarkdown });
  const reportIdRef = useRef(report.id);
  draftRef.current = { title, contentMarkdown };

  useEffect(() => {
    setTitle(report.title);
    setContentMarkdown(report.contentMarkdown);
    setSaveState('idle');
    setSaveMessage(null);
    setNotice(null);
    setDeleteConfirm(false);
    setView('edit');
  }, [report.id]);

  useEffect(() => {
    reportIdRef.current = report.id;
    persistedRef.current = { title: report.title, contentMarkdown: report.contentMarkdown };
  }, [report.id, report.title, report.contentMarkdown]);

  useEffect(
    () => () => {
      const draft = draftRef.current;
      const persisted = persistedRef.current;
      const patch: ReportUpdateInput = {};
      if (draft.title.trim() && draft.title.trim() !== persisted.title) patch.title = draft.title.trim();
      if (draft.contentMarkdown !== persisted.contentMarkdown) patch.contentMarkdown = draft.contentMarkdown;
      if (Object.keys(patch).length > 0) {
        void window.memex.reports.update(reportIdRef.current, patch).catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    const cleanTitle = title.trim();
    const patch: ReportUpdateInput = {};
    if (cleanTitle && cleanTitle !== report.title) patch.title = cleanTitle;
    if (contentMarkdown !== report.contentMarkdown) patch.contentMarkdown = contentMarkdown;

    if (Object.keys(patch).length === 0) {
      if (saveState === 'saving' || saveState === 'error') {
        setSaveState('idle');
        setSaveMessage(null);
      }
      return;
    }
    if (!cleanTitle) {
      setSaveState('error');
      setSaveMessage('标题不能为空');
      return;
    }

    setSaveState('saving');
    setSaveMessage(null);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const savedDraft = { title: title.trim(), contentMarkdown };
        const updated = await window.memex.reports.update(report.id, patch);
        if (cancelled) return;
        persistedRef.current = savedDraft;
        useReportStore.getState().applyReport(updated);
        setSaveState('saved');
      } catch (error) {
        if (cancelled) return;
        setSaveState('error');
        setSaveMessage(error instanceof Error ? error.message : String(error));
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [title, contentMarkdown, report.id, report.title, report.contentMarkdown]);

  const latestSaved = title.trim() === report.title && contentMarkdown === report.contentMarkdown && saveState !== 'error';
  const canExport = latestSaved && saveState !== 'saving' && !exporting;
  const statusText = useMemo(() => {
    if (saveState === 'saving') return '保存中';
    if (saveState === 'saved') return '已保存';
    if (saveState === 'error') return '保存失败';
    return null;
  }, [saveState]);

  const exportReport = async (kind: 'markdown' | 'pdf') => {
    setExporting(kind);
    setNotice(null);
    try {
      const path =
        kind === 'markdown'
          ? await window.memex.reports.exportMarkdown(report.id)
          : await window.memex.reports.exportPdf(report.id);
      setNotice(path ? `已导出到 ${path}` : '已取消导出');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(null);
    }
  };

  const remove = async () => {
    setDeleting(true);
    await useReportStore.getState().removeReport(report.id);
    setDeleting(false);
  };

  return (
    <motion.section
      key={report.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]"
    >
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-10 py-8">
        <header className="mb-5">
          <div className="flex flex-wrap items-start gap-3">
            <Input
              aria-label="周报标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-auto min-w-[280px] flex-1 border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus:border-transparent focus:ring-0"
            />
            <div className="flex items-center gap-2 pt-1">
              {statusText ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[10.5px]',
                    saveState === 'error' ? 'text-red-600' : saveState === 'saved' ? 'text-[var(--success)]' : 'text-[var(--faint)]',
                  )}
                >
                  {saveState === 'saving' ? <Loader2 size={11} className="animate-spin" /> : saveState === 'saved' ? <Check size={11} /> : <AlertCircle size={11} />}
                  {statusText}
                </span>
              ) : null}
              <div className="flex rounded-lg border border-[var(--line)] bg-[var(--surface)] p-0.5">
                <button
                  onClick={() => setView('edit')}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-md px-2 text-[10.5px] transition',
                    view === 'edit' ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)]',
                  )}
                >
                  <PencilLine size={11} /> 编辑
                </button>
                <button
                  onClick={() => setView('preview')}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-md px-2 text-[10.5px] transition',
                    view === 'preview' ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)]',
                  )}
                >
                  <Eye size={11} /> 预览
                </button>
              </div>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[var(--faint)]">
            {formatPeriod(report)} · {report.template.name} · {report.tasks.length} 项任务 · {report.notes.length} 篇笔记
          </p>
          <p className="mt-1 text-[10px] text-[var(--faint)]">
            生成于 {formatDateTime(report.generationMeta.generatedAt)} · 模型 {report.generationMeta.model}
          </p>
          {saveMessage ? <p className="mt-1 text-[10.5px] text-red-600">{saveMessage}</p> : null}
        </header>

        <div className="min-h-[480px] flex-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-soft">
          {view === 'edit' ? (
            <Textarea
              aria-label="Markdown 内容"
              value={contentMarkdown}
              onChange={(event) => setContentMarkdown(event.target.value)}
              className="min-h-[480px] resize-y border-0 bg-transparent px-7 py-6 font-mono text-[13px] leading-7 focus:ring-0"
            />
          ) : (
            <MarkdownPreview value={contentMarkdown} className="min-h-[480px] px-8 py-6" />
          )}
        </div>

        {notice ? (
          <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[10.5px] text-[var(--muted)]">
            {notice}
          </p>
        ) : null}

        <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="soft" size="sm" disabled={!canExport} onClick={() => void exportReport('markdown')}>
            {exporting === 'markdown' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            导出 Markdown
          </Button>
          <Button variant="outline" size="sm" disabled={!canExport} onClick={() => void exportReport('pdf')}>
            {exporting === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            导出 PDF
          </Button>
          <Button variant="ghost" size="sm" disabled={!latestSaved} onClick={() => useReportStore.getState().regenerateReport(report)}>
            <RefreshCw size={13} /> 重新生成
          </Button>
          <span className="flex-1" />
          {deleteConfirm ? (
            <>
              <span className="text-[10.5px] text-red-600">删除后不可恢复。</span>
              <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setDeleteConfirm(false)}>
                取消
              </Button>
              <Button variant="danger" size="sm" disabled={deleting} onClick={() => void remove()}>
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                确认删除
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="text-[var(--muted)] hover:text-red-500" onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={13} /> 删除报告
            </Button>
          )}
        </footer>
      </div>
    </motion.section>
  );
}
