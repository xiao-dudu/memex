import { useEffect, useMemo, useRef, useState } from 'react';
import type { TeamSessionInfo, TeamTask } from '@memex/shared';
import { emptyDocument, textToDocument, toPlainText } from '../../lib/tiptap';
import { useTeamStore } from '../../store/useTeamStore';
import { Drawer } from '../ui/drawer';
import { RichTextEditor, type RichTextChange } from '../editor/RichTextEditor';

interface Props {
  task: TeamTask;
  open: boolean;
  onClose(): void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface TeamTaskDescriptionDraft {
  contentJson: string;
  plainText: string;
  error: string | null;
}

const descriptionDrafts = new Map<string, TeamTaskDescriptionDraft>();

export function clearTeamTaskDescriptionDrafts(): void {
  descriptionDrafts.clear();
}

function initialDocument(task: TeamTask): string {
  if (task.descriptionJson) return task.descriptionJson;
  if (task.description?.trim()) return textToDocument(task.description);
  return emptyDocument();
}

function readOnlyText(task: TeamTask): string {
  if (task.description?.trim()) return task.description;
  if (task.descriptionJson) {
    try {
      return toPlainText(JSON.parse(task.descriptionJson)) || '暂无描述';
    } catch {
      return '暂无描述';
    }
  }
  return '暂无描述';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function canEditTeamTask(task: TeamTask, session: TeamSessionInfo): boolean {
  if (task.archivedAt !== null || session.role !== 'leader') return false;
  return (
    task.createdBy === session.userId ||
    task.leaders.some((leader) => leader.id === session.userId)
  );
}

export function TeamTaskDescriptionDrawer({ task, open, onClose }: Props) {
  const updateTask = useTeamStore((state) => state.updateTask);
  const session = useTeamStore((state) => state.session);
  const storedVersion = useTeamStore((state) =>
    state.activeTask?.id === task.id ? state.activeTask.version : task.version,
  );
  const [saveState, setSaveState] = useState<SaveState>(() =>
    descriptionDrafts.get(task.id)?.error ? 'error' : 'idle',
  );
  const timerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const inFlightTaskRef = useRef<string | null>(null);
  const versionsRef = useRef<Record<string, number>>({});
  const activeTaskIdRef = useRef(task.id);
  versionsRef.current[task.id] = storedVersion;
  activeTaskIdRef.current = task.id;

  const document = useMemo(() => {
    const pending = descriptionDrafts.get(task.id);
    return pending?.contentJson ?? initialDocument(task);
  }, [task.id, task.description, task.descriptionJson, open]);
  const canEdit = canEditTeamTask(task, session);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const currentVersion = (taskId: string) => {
    const active = useTeamStore.getState().activeTask;
    if (active?.id === taskId) {
      versionsRef.current[taskId] = active.version;
      return active.version;
    }
    return versionsRef.current[taskId] ?? task.version;
  };

  const nextPendingTaskId = () => {
    for (const [taskId, draft] of descriptionDrafts) {
      if (!draft.error) return taskId;
    }
    return null;
  };

  const scheduleIdle = () => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setSaveState('idle'), 1200);
  };

  const drain = async (taskId: string, retryError = false) => {
    if (inFlightTaskRef.current !== null) return;
    const draft = descriptionDrafts.get(taskId);
    if (!draft || (draft.error && !retryError)) return;

    if (draft.error) descriptionDrafts.set(taskId, { ...draft, error: null });
    inFlightTaskRef.current = taskId;
    if (activeTaskIdRef.current === taskId) setSaveState('saving');

    try {
      await updateTask(taskId, {
        description: draft.plainText,
        descriptionJson: draft.contentJson,
        expectedVersion: currentVersion(taskId),
      });
      const active = useTeamStore.getState().activeTask;
      if (active?.id === taskId) versionsRef.current[taskId] = active.version;

      const current = descriptionDrafts.get(taskId);
      if (current?.contentJson === draft.contentJson) descriptionDrafts.delete(taskId);

      if (activeTaskIdRef.current === taskId) {
        if (current?.contentJson === draft.contentJson || !current) {
          setSaveState('saved');
          scheduleIdle();
        } else {
          setSaveState('saving');
        }
      }
    } catch (error) {
      const current = descriptionDrafts.get(taskId);
      if (current) descriptionDrafts.set(taskId, { ...current, error: errorMessage(error) });
      if (activeTaskIdRef.current === taskId) setSaveState('error');
    } finally {
      inFlightTaskRef.current = null;
      const nextTaskId = nextPendingTaskId();
      if (nextTaskId) void drain(nextTaskId);
    }
  };

  const flush = (taskId = task.id, retryError = false) => {
    clearTimer();
    if (inFlightTaskRef.current !== null) return;
    void drain(taskId, retryError);
  };

  const handleClose = () => {
    if (!descriptionDrafts.get(task.id)?.error) flush();
    onClose();
  };

  useEffect(() => {
    const draft = descriptionDrafts.get(task.id);
    setSaveState(draft?.error ? 'error' : draft ? 'saving' : 'idle');
    if (open && draft && !draft.error) flush(task.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, open]);

  useEffect(() => {
    return () => {
      if (!descriptionDrafts.get(task.id)?.error) flush(task.id);
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, open]);

  return (
    <Drawer
      open={open}
      title="团队任务描述"
      description={task.title}
      onClose={handleClose}
      footer={
        canEdit ? (
          saveState === 'error' ? (
            <>
              <span role="alert">保存失败，请重试</span>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="重试保存"
                className="text-[var(--accent)]"
                onClick={() => flush(task.id, true)}
              >
                重试保存
              </button>
            </>
          ) : (
            <span>{saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '自动保存'}</span>
          )
        ) : (
          <span>只读</span>
        )
      }
    >
      {open ? (
        canEdit ? (
          <RichTextEditor
            documentKey={task.id}
            contentJson={document}
            placeholder="补充任务背景、交付标准或上下文…"
            onChange={(value) => {
              if (idleTimerRef.current !== null) {
                window.clearTimeout(idleTimerRef.current);
                idleTimerRef.current = null;
              }
              descriptionDrafts.set(task.id, {
                contentJson: value.contentJson,
                plainText: value.plainText,
                error: null,
              });
              setSaveState('saving');
              clearTimer();
              timerRef.current = window.setTimeout(() => flush(task.id), 500);
            }}
            onBlur={() => flush(task.id)}
          />
        ) : (
          <div
            aria-label="团队任务描述内容"
            className="whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] leading-6 text-[var(--ink)]"
          >
            {readOnlyText(task)}
          </div>
        )
      ) : null}
    </Drawer>
  );
}
