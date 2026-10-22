import { BookTemplate, FilePlus2, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { useReportStore } from '../../store/useReportStore';

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

function NewReportWorkspace() {
  return (
    <div className="thin-scroll flex flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[820px] px-10 py-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <FilePlus2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">新建周报</h1>
            <p className="mt-0.5 text-xs text-[var(--faint)]">选择时间范围、模板和要纳入的任务。</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-soft">
          <p className="text-sm font-medium">准备生成新周报</p>
          <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
            默认范围为最近 7 个自然日。加载候选任务后，可逐项调整发送给模型的内容。
          </p>
        </div>
      </div>
    </div>
  );
}

function ReportDetailPreview() {
  const report = useReportStore((state) => state.activeReport);
  if (!report) return <EmptyWorkspace />;

  return (
    <motion.section
      key={report.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]"
    >
      <div className="mx-auto w-full max-w-[860px] px-10 py-9">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
          <p className="mt-2 text-xs text-[var(--faint)]">
            {report.template.name} · {report.tasks.length} 项任务 · {report.notes.length} 篇笔记
          </p>
        </div>
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-soft">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--ink)]">{report.contentMarkdown}</pre>
        </article>
      </div>
    </motion.section>
  );
}

function TemplateWorkspace() {
  const { templates, activeTemplateId } = useReportStore();
  const template = templates.find((item) => item.id === activeTemplateId);

  if (!template) {
    return (
      <div className="thin-scroll flex flex-1 overflow-y-auto bg-[var(--bg)]">
        <div className="mx-auto w-full max-w-[820px] px-10 py-9">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <BookTemplate size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">新建模板</h1>
              <p className="mt-0.5 text-xs text-[var(--faint)]">配置结构化章节、基础提示词和自定义约束。</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-soft">
            <p className="text-sm font-medium">创建自己的周报模板</p>
            <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
              内置模板不能直接修改，但可以复制为自定义模板后编辑。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="thin-scroll flex flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[820px] px-10 py-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <BookTemplate size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{template.name}</h1>
              {template.isBuiltin ? (
                <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] text-[var(--accent)]">内置</span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-[var(--faint)]">{template.description || '暂无说明'}</p>
          </div>
        </div>
        <div className="space-y-4">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">基础提示词</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{template.basePrompt}</p>
          </section>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">章节</p>
            <div className="mt-3 space-y-2">
              {template.sections.map((section, index) => (
                <div key={section.id} className="rounded-xl bg-[var(--surface-2)] px-3 py-2 ring-1 ring-[var(--line)]">
                  <p className="text-sm font-medium">
                    {index + 1}. {section.title}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{section.instruction || '无额外写作要求'}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ReportWorkspace() {
  const mode = useReportStore((state) => state.mode);
  if (mode === 'new') return <NewReportWorkspace />;
  if (mode === 'report') return <ReportDetailPreview />;
  if (mode === 'template') return <TemplateWorkspace />;
  return <EmptyWorkspace />;
}
