import { FileText } from 'lucide-react';

import { useReportStore } from '../../store/useReportStore';
import { NewReportWizard } from './NewReportWizard';
import { ReportDetail } from './ReportDetail';
import { TemplateEditor } from './TemplateEditor';

function EmptyWorkspace() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg)] paper-grain px-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)] shadow-soft">
        <FileText size={22} />
      </div>
      <p className="text-sm font-medium">选择一篇周报或创建新周报</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--faint)]">
        周报会保存完整快照，后续修改任务、笔记或模板不会改变历史内容。
      </p>
    </div>
  );
}

export function ReportWorkspace() {
  const mode = useReportStore((state) => state.mode);
  const activeReport = useReportStore((state) => state.activeReport);
  const activeTemplateId = useReportStore((state) => state.activeTemplateId);
  const templates = useReportStore((state) => state.templates);
  if (mode === 'new') return <NewReportWizard />;
  if (mode === 'report') return activeReport ? <ReportDetail key={activeReport.id} report={activeReport} /> : <EmptyWorkspace />;
  if (mode === 'template') {
    return <TemplateEditor template={templates.find((template) => template.id === activeTemplateId) ?? null} />;
  }
  return <EmptyWorkspace />;
}
