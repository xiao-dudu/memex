import { useEffect } from 'react';
import { BookTemplate, ChevronsDownUp, FileText, Plus, SearchX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReportSummary, ReportTemplate } from '@memex/shared';
import { relativeTime } from '../../lib/date';
import { useAppStore } from '../../store/useAppStore';
import { useReportStore } from '../../store/useReportStore';
import { cn } from '../ui/utils';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPeriod(report: ReportSummary): string {
  return `${formatDate(report.periodStart)} 至 ${formatDate(report.periodEnd - 1)}`;
}

function ReportRow({ report }: { report: ReportSummary }) {
  const { activeReport, selectReport } = useReportStore();
  return (
    <motion.button
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      onClick={() => void selectReport(report.id)}
      className={cn(
        'group mb-0.5 flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors',
        activeReport?.id === report.id
          ? 'bg-[var(--surface-2)] shadow-sm ring-1 ring-[var(--line)]'
          : 'hover:bg-[var(--hover)]',
      )}
    >
      <div className="flex items-start gap-2">
        <FileText size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--ink)]">{report.title}</span>
        <span className="shrink-0 text-[9.5px] text-[var(--faint)]">{relativeTime(report.createdAt)}</span>
      </div>
      <p className="pl-6 text-[10.5px] text-[var(--muted)]">{formatPeriod(report)}</p>
      <div className="flex items-center gap-1.5 pl-6 text-[9.5px] text-[var(--faint)]">
        <span className="truncate">{report.templateName}</span>
        <span>·</span>
        <span>{report.taskCount} 项任务</span>
        {report.noteCount > 0 ? (
          <>
            <span>·</span>
            <span>{report.noteCount} 篇笔记</span>
          </>
        ) : null}
      </div>
    </motion.button>
  );
}

function TemplateRow({ template }: { template: ReportTemplate }) {
  const { activeTemplateId, selectTemplate } = useReportStore();
  return (
    <motion.button
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      onClick={() => selectTemplate(template.id)}
      className={cn(
        'group mb-0.5 flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors',
        activeTemplateId === template.id
          ? 'bg-[var(--surface-2)] shadow-sm ring-1 ring-[var(--line)]'
          : 'hover:bg-[var(--hover)]',
      )}
    >
      <div className="flex items-center gap-2">
        <BookTemplate size={14} className="shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--ink)]">{template.name}</span>
        {template.isBuiltin ? (
          <span className="shrink-0 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] text-[var(--accent)]">内置</span>
        ) : null}
      </div>
      <p className="line-clamp-2 pl-6 text-[10.5px] leading-[1.55] text-[var(--faint)]">
        {template.description || template.basePrompt}
      </p>
      <span className="pl-6 text-[9.5px] text-[var(--faint)]">{relativeTime(template.updatedAt)}更新</span>
    </motion.button>
  );
}

export function ReportList() {
  const { tab, reports, templates, loading, error, load, setTab, startNewReport, startNewTemplate } =
    useReportStore();
  const setListCollapsed = useAppStore((state) => state.setListCollapsed);

  useEffect(() => {
    void load();
  }, [load]);

  const list = tab === 'reports' ? reports : templates;
  const startNew = tab === 'reports' ? startNewReport : startNewTemplate;

  return (
    <section className="flex w-[356px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      <header className="flex h-[62px] shrink-0 items-center gap-2 border-b border-[var(--line)] px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">周报</h1>
            <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--muted)]">
              {list.length}
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-[var(--faint)]">生成、编辑并导出工作周报</p>
        </div>
        <button
          onClick={() => setListCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          title="折叠列表"
        >
          <ChevronsDownUp size={14} />
        </button>
      </header>

      <div className="border-b border-[var(--line)] px-3 py-2.5">
        <div className="flex rounded-xl border border-[var(--line)] bg-[var(--bg)]/55 p-1">
          <button
            onClick={() => setTab('reports')}
            className={cn(
              'h-7 flex-1 rounded-lg text-[11px] font-medium transition',
              tab === 'reports'
                ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
          >
            报告
          </button>
          <button
            onClick={() => setTab('templates')}
            className={cn(
              'h-7 flex-1 rounded-lg text-[11px] font-medium transition',
              tab === 'templates'
                ? 'bg-[var(--surface-2)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
          >
            模板
          </button>
        </div>
        <button
          onClick={startNew}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--line-strong)] text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/45 hover:text-[var(--accent)]"
        >
          <Plus size={13} /> {tab === 'reports' ? '新建周报' : '新建模板'}
        </button>
      </div>

      {error ? <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-[10.5px] text-red-700">{error}</p> : null}

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-4 pt-1">
        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-[82px] animate-pulse rounded-xl bg-[var(--hover)]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-sm">
              <SearchX size={20} />
            </div>
            <p className="text-[13px] font-medium">{tab === 'reports' ? '还没有周报' : '还没有自定义模板'}</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--faint)]">
              {tab === 'reports' ? '选择时间范围和任务，生成第一篇周报。' : '复制内置模板后即可创建自己的模板。'}
            </p>
            <button
              onClick={startNew}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ink)] px-3 text-[11px] font-medium text-[var(--bg)] transition hover:opacity-85"
            >
              <Plus size={12} /> {tab === 'reports' ? '新建周报' : '新建模板'}
            </button>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {tab === 'reports'
              ? reports.map((report) => <ReportRow key={report.id} report={report} />)
              : templates.map((template) => <TemplateRow key={template.id} template={template} />)}
          </AnimatePresence>
        )}
      </div>

      <footer className="flex h-9 shrink-0 items-center border-t border-[var(--line)] px-4 text-[10px] text-[var(--faint)]">
        <span>{tab === 'reports' ? `${reports.length} 篇历史报告` : `${templates.length} 个模板`}</span>
        <span className="flex-1" />
        <span>Ctrl+N 新建</span>
      </footer>
    </section>
  );
}
