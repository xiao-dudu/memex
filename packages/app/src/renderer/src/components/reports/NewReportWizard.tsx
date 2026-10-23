import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDashed,
  FileText,
  Loader2,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { AiServiceConfig, ReportCandidate } from '@memex/shared';
import { displayEndDate, formatLocalDateInput, localDayEndExclusive, localDayStart, defaultReportPeriod } from '../../lib/report-period';
import { useAppStore } from '../../store/useAppStore';
import { useReportStore } from '../../store/useReportStore';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';

const GROUPS: { status: ReportCandidate['status']; label: string; icon: typeof Circle }[] = [
  { status: 'done', label: '已完成', icon: CheckCircle2 },
  { status: 'doing', label: '进行中', icon: CircleDashed },
  { status: 'todo', label: '待办', icon: Circle },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serviceHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function NewReportWizard() {
  const prefill = useMemo(() => useReportStore.getState().wizardPrefill, []);
  const initialPeriod = useMemo(() => {
    if (prefill) {
      return { start: formatLocalDateInput(prefill.periodStart), end: displayEndDate(prefill.periodEnd) };
    }
    return defaultReportPeriod(new Date());
  }, [prefill]);
  const templates = useReportStore((state) => state.templates);
  const setActiveReport = useReportStore((state) => state.setActiveReport);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const settingsOpen = useAppStore((state) => state.settingsOpen);

  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const [templateId, setTemplateId] = useState(() => prefill?.templateId ?? useReportStore.getState().templates[0]?.id ?? '');
  const [includeNotes, setIncludeNotes] = useState(prefill?.includeNotes ?? false);
  const [aiConfig, setAiConfig] = useState<AiServiceConfig | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [candidates, setCandidates] = useState<ReportCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelledByUser = useRef(false);
  const prefillApplied = useRef(false);
  const candidateRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        let availableTemplates = useReportStore.getState().templates;
        if (availableTemplates.length === 0) {
          availableTemplates = await window.memex.templates.list();
          if (active) useReportStore.setState({ templates: availableTemplates });
        }
        if (active) {
          setTemplateId((current) => {
            if (availableTemplates.some((template) => template.id === current)) return current;
            if (prefill?.templateId && availableTemplates.some((template) => template.id === prefill.templateId)) {
              return prefill.templateId;
            }
            return availableTemplates[0]?.id || '';
          });
        }

      } catch (initError) {
        if (active) setError(errorMessage(initError));
      } finally {
        if (active) setAiLoading(false);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    if (settingsOpen) return;
    let active = true;
    setAiLoading(true);
    void window.memex.ai
      .getConfig()
      .then((config) => {
        if (active) setAiConfig(config);
      })
      .catch((configError) => {
        if (active) setError(errorMessage(configError));
      })
      .finally(() => {
        if (active) setAiLoading(false);
      });
    return () => {
      active = false;
    };
  }, [settingsOpen]);


  useEffect(() => {
    if (!generating) return;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [generating]);

  const period = useMemo(() => {
    try {
      const start = localDayStart(periodStart);
      const end = localDayEndExclusive(periodEnd);
      return end > start ? { start, end } : null;
    } catch {
      return null;
    }
  }, [periodStart, periodEnd]);

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const aiConfigured = Boolean(aiConfig?.baseUrl.trim() && aiConfig.model.trim());
  const selectedTasks = candidates.filter((candidate) => selectedIds.has(candidate.id));
  const selectedNoteIds = new Set(
    includeNotes ? selectedTasks.flatMap((task) => (task.noteId ? [task.noteId] : [])) : [],
  );
  const allSelected = candidates.length > 0 && selectedTasks.length === candidates.length;

  const resetCandidates = () => {
    candidateRequestId.current += 1;
    setLoadingCandidates(false);
    setCandidates([]);
    setSelectedIds(new Set());
    setLoaded(false);
    setConfirmOpen(false);
  };

  const loadCandidates = async () => {
    if (!period) return;
    const requestId = ++candidateRequestId.current;
    setLoadingCandidates(true);
    setError(null);
    try {
      const result = await window.memex.reports.candidates({
        periodStart: period.start,
        periodEnd: period.end,
      });
      if (requestId !== candidateRequestId.current) return;
      setCandidates(result);
      let initiallySelected = result;
      if (!prefillApplied.current && prefill?.taskIds.length) {
        const prefilledTasks = result.filter((task) => prefill.taskIds.includes(task.id));
        if (prefilledTasks.length > 0) initiallySelected = prefilledTasks;
        prefillApplied.current = true;
      }
      setSelectedIds(new Set(initiallySelected.map((task) => task.id)));
      setLoaded(true);
    } catch (loadError) {
      if (requestId === candidateRequestId.current) setError(errorMessage(loadError));
    } finally {
      if (requestId === candidateRequestId.current) setLoadingCandidates(false);
    }
  };

  const toggleTask = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmOpen(false);
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(candidates.map((task) => task.id)));
    setConfirmOpen(false);
  };

  const toggleGroup = (status: ReportCandidate['status']) => {
    const groupIds = candidates.filter((task) => task.status === status).map((task) => task.id);
    const allGroupSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of groupIds) {
        if (allGroupSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setConfirmOpen(false);
  };

  const generate = async () => {
    if (!period || !selectedTemplate || selectedTasks.length === 0 || !aiConfigured || aiLoading || generating) return;
    cancelledByUser.current = false;
    setConfirmOpen(false);
    setGenerating(true);
    setError(null);
    try {
      const report = await window.memex.reports.generate({
        periodStart: period.start,
        periodEnd: period.end,
        templateId: selectedTemplate.id,
        taskIds: selectedTasks.map((task) => task.id),
        includeNotes,
        aiConfigRevision: aiConfig!.revision,
      });
      setGenerating(false);
      setActiveReport(report);
    } catch (generateError) {
      setError(cancelledByUser.current ? '已取消生成' : errorMessage(generateError));
      setGenerating(false);
    }
  };

  const cancelGeneration = () => {
    cancelledByUser.current = true;
    void window.memex.reports.cancel().catch(() => undefined);
  };

  const disabledReason = aiLoading
    ? '正在读取 AI 服务配置'
    : !period
    ? '请选择有效的时间范围'
    : !selectedTemplate
      ? '请选择模板'
      : !aiConfigured
        ? '请先配置 AI 服务'
        : !loaded
          ? '请先加载任务'
          : selectedTasks.length === 0
            ? '请至少选择一条任务'
            : null;

  const host = aiConfig?.baseUrl ? serviceHost(aiConfig.baseUrl) : '';

  return (
    <div className="thin-scroll flex flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[880px] px-10 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">新建周报</h1>
            <p className="mt-0.5 text-[12px] text-[var(--faint)]">先手动选择发送范围，再让模型生成 Markdown 周报。</p>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-[var(--accent)]" />
              <h2 className="text-[13px] font-semibold">时间范围</h2>
              <span className="text-[12px] text-[var(--faint)]">结束日期包含在范围内</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[12px] text-[var(--muted)]">开始日期</span>
                <Input
                  type="date"
                  disabled={loadingCandidates}
                  value={periodStart}
                  onChange={(event) => {
                    setPeriodStart(event.target.value);
                    resetCandidates();
                  }}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[12px] text-[var(--muted)]">结束日期</span>
                <Input
                  type="date"
                  disabled={loadingCandidates}
                  value={periodEnd}
                  onChange={(event) => {
                    setPeriodEnd(event.target.value);
                    resetCandidates();
                  }}
                />
              </label>
            </div>
            {period ? (
              <p className="mt-2 text-[12px] text-[var(--faint)]">
                将筛选 {periodStart} 至 {displayEndDate(period.end)} 期间有活动或截止时间的任务。
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-red-600">结束日期必须晚于开始日期。</p>
            )}
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="space-y-1.5">
                <span className="text-[12px] text-[var(--muted)]">周报模板</span>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]/60"
                >
                  {templates.length === 0 ? <option value="">没有可用模板</option> : null}
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isBuiltin ? '（内置）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--ink)]">
                <Checkbox checked={includeNotes} onChange={setIncludeNotes} label="包含关联笔记" />
                包含关联笔记
              </label>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[var(--faint)]">
              关联笔记默认关闭。开启后，仅发送勾选任务所关联且未删除的笔记。
            </p>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <FileText size={15} className="text-[var(--accent)]" />
              <h2 className="text-[13px] font-semibold">候选任务</h2>
              {loaded ? (
                <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[12px] text-[var(--muted)]">
                  {selectedTasks.length}/{candidates.length} 已选择
                  {includeNotes ? ` · ${selectedNoteIds.size} 篇笔记` : ''}
                </span>
              ) : null}
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                disabled={!period || loadingCandidates}
                onClick={() => void loadCandidates()}
              >
                {loadingCandidates ? <Loader2 size={13} className="animate-spin" /> : null}
                加载任务
              </Button>
            </div>

            {!loaded ? (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--line-strong)] px-4 py-7 text-center">
                <p className="text-[12px] font-medium text-[var(--muted)]">选择时间范围后加载候选任务</p>
                <p className="mt-1 text-[12px] text-[var(--faint)]">候选任务默认全部勾选，可逐项取消。</p>
              </div>
            ) : candidates.length === 0 ? (
              <div className="mt-4 rounded-xl bg-[var(--surface-2)] px-4 py-7 text-center ring-1 ring-[var(--line)]">
                <p className="text-[12px] font-medium">这个时间范围内没有任务</p>
                <p className="mt-1 text-[12px] text-[var(--faint)]">可以调整时间范围后重新加载。</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-[12px] text-[var(--muted)]">
                  <Checkbox checked={allSelected} onChange={toggleAll} label="全选所有候选任务" />
                  全选所有候选任务
                </label>
                {GROUPS.map((group) => {
                  const groupTasks = candidates.filter((task) => task.status === group.status);
                  if (groupTasks.length === 0) return null;
                  const Icon = group.icon;
                  const allGroupSelected = groupTasks.every((task) => selectedIds.has(task.id));
                  return (
                    <div key={group.status} className="overflow-hidden rounded-xl border border-[var(--line)]">
                      <div className="flex items-center gap-2 bg-[var(--surface-2)] px-3 py-2">
                        <Icon size={13} className="text-[var(--accent)]" />
                        <span className="text-[12px] font-medium">{group.label}</span>
                        <span className="text-[12px] text-[var(--faint)]">{groupTasks.length}</span>
                        <span className="flex-1" />
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.status)}
                          className="text-[12px] text-[var(--muted)] hover:text-[var(--accent)]"
                        >
                          {allGroupSelected ? '取消全选' : '全选'}
                        </button>
                      </div>
                      <div className="divide-y divide-[var(--line)]">
                        {groupTasks.map((task) => (
                          <label
                            key={task.id}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-[var(--hover)]',
                              selectedIds.has(task.id) ? '' : 'opacity-55',
                            )}
                          >
                            <Checkbox
                              checked={selectedIds.has(task.id)}
                              onChange={() => toggleTask(task.id)}
                              label={`选择 ${task.title}`}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{task.title}</span>
                              <span className="mt-0.5 block text-[12px] text-[var(--faint)]">
                                {task.priority === 'high' ? '高优先级' : task.priority === 'medium' ? '中优先级' : '低优先级'}
                                {task.noteId ? ` · 关联笔记：${task.noteTitle ?? '未命名'}` : ''}
                                {task.tags.length > 0 ? ` · ${task.tags.join('、')}` : ''}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium">AI 服务</p>
                <p className="mt-1 text-[12px] text-[var(--faint)]">
                  {aiLoading
                    ? '正在读取配置…'
                    : aiConfigured
                      ? `发送服务：${host} · ${aiConfig?.model}`
                      : '尚未配置可用的 Base URL 和模型。'}
                </p>
              </div>
              {!aiConfigured && !aiLoading ? (
                <Button variant="soft" size="sm" onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={13} /> 前往配置
                </Button>
              ) : null}
            </div>
          </section>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[12px] text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {generating ? (
            <section className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/55 p-5">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
                <div className="flex-1">
                  <p className="text-[15px] font-medium">正在生成周报</p>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">已用 {elapsedSeconds} 秒，请勿重复提交。</p>
                </div>
                <Button variant="outline" size="sm" onClick={cancelGeneration}>
                  取消生成
                </Button>
              </div>
            </section>
          ) : confirmOpen ? (
            <section className="rounded-xl border border-[var(--accent)]/30 bg-[var(--surface)] p-5 shadow-soft">
              <p className="text-[15px] font-medium">确认发送范围</p>
              <p className="mt-2 text-[12px] leading-6 text-[var(--muted)]">
                将发送 {selectedTasks.length} 条任务、{selectedNoteIds.size} 篇关联笔记到 {host}。
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                  返回调整
                </Button>
                <Button variant="accent" size="sm" disabled={aiLoading} onClick={() => void generate()}>
                  {aiLoading ? '正在刷新配置…' : '确认发送'}
                </Button>
              </div>
            </section>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--faint)]">{disabledReason ?? '确认后将向上述 AI 服务发送所选内容。'}</span>
              <span className="flex-1" />
              <Button
                variant="accent"
                disabled={Boolean(disabledReason) || generating}
                onClick={() => setConfirmOpen(true)}
              >
                <Sparkles size={14} /> 生成周报
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
