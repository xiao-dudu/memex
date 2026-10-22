import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Plus, Save, Trash2 } from 'lucide-react';
import {
  reportTemplateCreateSchema,
  type ReportTemplate,
  type ReportTemplateInput,
  type ReportTemplateSection,
} from '@memex/shared/reports';
import { useReportStore } from '../../store/useReportStore';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input, Textarea } from '../ui/input';
import { PromptPreview } from './PromptPreview';

interface TemplateEditorProps {
  template: ReportTemplate | null;
}

function newSection(): ReportTemplateSection {
  return { id: crypto.randomUUID(), title: '新章节', instruction: '', allowEmpty: true };
}

function validationMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TemplateEditor({ template }: TemplateEditorProps) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [basePrompt, setBasePrompt] = useState(template?.basePrompt ?? '');
  const [sections, setSections] = useState<ReportTemplateSection[]>(template?.sections ?? [newSection()]);
  const [constraints, setConstraints] = useState(template?.constraints ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const justSaved = useRef(false);

  useEffect(() => {
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setBasePrompt(template?.basePrompt ?? '');
    setSections(template?.sections ?? [newSection()]);
    setConstraints(template?.constraints ?? '');
    setSaving(false);
    setSaved(justSaved.current);
    justSaved.current = false;
    setError(null);
    setDeleteConfirm(false);
    setShowPreview(false);
  }, [template?.id]);

  const isBuiltin = template?.isBuiltin ?? false;
  const previewTemplate = {
    name: name.trim() || '未命名模板',
    description: description.trim() || null,
    basePrompt,
    sections,
    constraints,
  };

  const updateSection = (id: string, patch: Partial<ReportTemplateSection>) => {
    setSections((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)));
    setSaved(false);
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setSaved(false);
  };

  const removeSection = (id: string) => {
    setSections((current) => (current.length > 1 ? current.filter((section) => section.id !== id) : current));
    setSaved(false);
  };

  const buildInput = (): ReportTemplateInput => ({
    name: name.trim(),
    description: description.trim() || null,
    basePrompt: basePrompt.trim(),
    sections,
    constraints,
  });

  const validate = (input: ReportTemplateInput): ReportTemplateInput => {
    const result = reportTemplateCreateSchema.safeParse(input);
    if (!result.success) throw new Error(result.error.issues[0]?.message || result.error.message);
    return result.data;
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const input = validate(buildInput());
      const savedTemplate =
        template && !template.isBuiltin
          ? await window.memex.templates.update(template.id, input)
          : await window.memex.templates.create(input);
      justSaved.current = true;
      useReportStore.getState().upsertTemplate(savedTemplate);
      setSaved(true);
    } catch (saveError) {
      setError(validationMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const copyTemplate = async () => {
    setError(null);
    setSaving(true);
    try {
      const input = validate({
        ...buildInput(),
        name: `${template?.name ?? '周报模板'}（副本）`,
        sections: sections.map((section) => ({ ...section, id: crypto.randomUUID() })),
      });
      const copied = await window.memex.templates.create(input);
      justSaved.current = true;
      useReportStore.getState().upsertTemplate(copied);
      setSaved(true);
    } catch (copyError) {
      setError(validationMessage(copyError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!template || template.isBuiltin) return;
    setSaving(true);
    await useReportStore.getState().removeTemplate(template.id);
    setSaving(false);
  };

  return (
    <div className="thin-scroll flex flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[860px] px-10 py-8">
        <header className="mb-5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{template ? '编辑模板' : '新建模板'}</h1>
              {isBuiltin ? (
                <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] text-[var(--accent)]">内置</span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--faint)]">
              {isBuiltin ? '内置模板不可直接修改' : '章节顺序会直接决定模型输出的结构。'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPreview((current) => !current)}>
            <Eye size={13} /> {showPreview ? '收起提示词预览' : '预览最终提示词'}
          </Button>
          {isBuiltin ? (
            <Button variant="accent" size="sm" disabled={saving} onClick={() => void copyTemplate()}>
              复制并编辑
            </Button>
          ) : (
            <>
              {template ? (
                <Button variant="outline" size="sm" disabled={saving} onClick={() => void copyTemplate()}>
                  复制模板
                </Button>
              ) : null}
              <Button variant="accent" size="sm" disabled={saving} onClick={() => void save()}>
                <Save size={13} /> 保存模板
              </Button>
            </>
          )}
        </header>

        <div className="space-y-4">
          <section className="grid gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[10.5px] text-[var(--muted)]">模板名称</span>
              <Input aria-label="模板名称" value={name} maxLength={200} disabled={isBuiltin} onChange={(event) => { setName(event.target.value); setSaved(false); }} />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10.5px] text-[var(--muted)]">模板说明</span>
              <Input aria-label="模板说明" value={description} maxLength={1000} disabled={isBuiltin} onChange={(event) => { setDescription(event.target.value); setSaved(false); }} />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-[10.5px] text-[var(--muted)]">基础提示词</span>
              <Textarea aria-label="基础提示词" value={basePrompt} rows={4} maxLength={20_000} disabled={isBuiltin} onChange={(event) => { setBasePrompt(event.target.value); setSaved(false); }} />
            </label>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-semibold">结构化章节</h2>
              <span className="text-[10px] text-[var(--faint)]">{sections.length}/20</span>
              <span className="flex-1" />
              <Button variant="ghost" size="sm" disabled={isBuiltin || sections.length >= 20} onClick={() => { setSections((current) => [...current, newSection()]); setSaved(false); }}>
                <Plus size={13} /> 添加章节
              </Button>
            </div>

            <div className="space-y-3">
              {sections.map((section, index) => (
                <div key={section.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--hover)] text-[10px] tabular-nums text-[var(--muted)]">{index + 1}</span>
                    <Input aria-label="章节标题" value={section.title} maxLength={100} disabled={isBuiltin} onChange={(event) => updateSection(section.id, { title: event.target.value })} />
                    <button type="button" disabled={isBuiltin || index === 0} onClick={() => moveSection(index, -1)} className="rounded p-1 text-[var(--faint)] hover:text-[var(--ink)] disabled:opacity-30" aria-label={`上移章节 ${index + 1}`}>
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" disabled={isBuiltin || index === sections.length - 1} onClick={() => moveSection(index, 1)} className="rounded p-1 text-[var(--faint)] hover:text-[var(--ink)] disabled:opacity-30" aria-label={`下移章节 ${index + 1}`}>
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" disabled={isBuiltin || sections.length === 1} onClick={() => removeSection(section.id)} className="rounded p-1 text-[var(--faint)] hover:text-red-500 disabled:opacity-30" aria-label={`删除章节 ${index + 1}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <Textarea
                    aria-label="章节写作要求"
                    value={section.instruction}
                    rows={2}
                    maxLength={5000}
                    disabled={isBuiltin}
                    onChange={(event) => updateSection(section.id, { instruction: event.target.value })}
                    className="mt-2 text-[12px]"
                    placeholder="说明这一章节需要写什么"
                  />
                  <label className="mt-2 flex w-fit items-center gap-2 text-[10.5px] text-[var(--muted)]">
                    <Checkbox disabled={isBuiltin} checked={section.allowEmpty} onChange={(checked) => updateSection(section.id, { allowEmpty: checked })} label={`允许章节 ${index + 1} 为空`} />
                    允许为空
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft">
            <label className="space-y-1.5">
              <span className="text-[10.5px] text-[var(--muted)]">自定义约束与注意事项</span>
              <Textarea aria-label="自定义约束" value={constraints} rows={3} maxLength={20_000} disabled={isBuiltin} onChange={(event) => { setConstraints(event.target.value); setSaved(false); }} />
            </label>
          </section>

          {showPreview ? <PromptPreview template={previewTemplate} /> : null}

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p> : null}
          {saved && !saving ? <p className="text-[10.5px] text-[var(--success)]">已保存</p> : null}

          {!isBuiltin && template ? (
            <footer className="flex items-center border-t border-[var(--line)] pt-4">
              <span className="flex-1" />
              {deleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-red-600">删除模板不影响历史报告。</span>
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => setDeleteConfirm(false)}>取消</Button>
                  <Button variant="danger" size="sm" disabled={saving} onClick={() => void remove()}>确认删除</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-[var(--muted)] hover:text-red-500" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 size={13} /> 删除模板
                </Button>
              )}
            </footer>
          ) : null}
        </div>
      </div>
    </div>
  );
}
