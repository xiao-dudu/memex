import { REPORT_SYSTEM_RULES, type ReportTemplate } from '@memex/shared/reports';

interface PromptPreviewProps {
  template: Pick<ReportTemplate, 'name' | 'description' | 'basePrompt' | 'sections' | 'constraints'>;
}

export function PromptPreview({ template }: PromptPreviewProps) {
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">系统固定规则（只读）</p>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-[11.5px] leading-6 text-[var(--muted)]">{REPORT_SYSTEM_RULES}</pre>
      </section>
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">用户模板</p>
        <div className="mt-2 space-y-2 text-[11.5px] leading-6 text-[var(--muted)]">
          <p className="font-medium text-[var(--ink)]">{template.name}</p>
          <p>{template.description || '无说明'}</p>
          <p className="whitespace-pre-wrap">基础提示词：{template.basePrompt}</p>
          <div>
            <p>章节：</p>
            <ol className="ml-5 list-decimal space-y-1">
              {template.sections.map((section) => (
                <li key={section.id}>
                  <span className="font-medium text-[var(--ink)]">{section.title}</span>
                  <span>：{section.instruction || '无额外写作要求'}</span>
                  <span className="text-[var(--faint)]">（{section.allowEmpty ? '允许为空' : '不可为空'}）</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="whitespace-pre-wrap">自定义约束：{template.constraints || '无'}</p>
        </div>
      </section>
    </div>
  );
}

