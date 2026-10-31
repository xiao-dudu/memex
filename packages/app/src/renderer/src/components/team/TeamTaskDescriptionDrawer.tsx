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

interface PendingDraft {
  taskId: string;
  value: RichTextChange;
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
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingDraft | null>(null);
  const savingRef = useRef(false);
  const versionsRef = useRef<Record<string, number>>({});
  const activeTaskIdRef = useRef(task.id);
  versionsRef.current[task.id] = storedVersion;
  activeTaskIdRef.current = task.id;

  const document = useMemo(
    () => initialDocument(task),
    [task.id, task.description, task.descriptionJson],
  );
  const canEdit = canEditTeamTask(task, session);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const pendingTaskId = () => pendingRef.current?.taskId ?? null;

  const currentVersion = (taskId: string) => {
    const active = useTeamStore.getState().activeTask;
    if (active?.id === taskId) {
      versionsRef.current[taskId] = active.version;
      return active.version;
    }
    return versionsRef.current[taskId] ?? task.version;
  };

  const scheduleIdle = () => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setSaveState('idle'), 1200);
  };

  const drain = async (taskId: string) => {
    if (savingRef.current) return;
    const pending = pendingRef.current;
    if (!pending || pending.taskId !== taskId) return;

    pendingRef.current = null;
    savingRef.current = true;
    if (activeTaskIdRef.current === taskId) setSaveState('saving');

    try {
      await updateTask(taskId, {
        description: pending.value.plainText,
        descriptionJson: pending.value.contentJson,
        expectedVersion: currentVersion(taskId),
      });
      const active = useTeamStore.getState().activeTask;
      if (active?.id === taskId) versionsRef.current[taskId] = active.version;
    } catch {
      if (!pendingRef.current) pendingRef.current = pending;
      savingRef.current = false;
      if (activeTaskIdRef.current === taskId) setSaveState('error');
      return;
    }

    savingRef.current = false;
    const nextTaskId = pendingTaskId();
    if (nextTaskId) {
      void drain(nextTaskId);
      return;
    }
    if (activeTaskIdRef.current === taskId) {
      setSaveState('saved');
      scheduleIdle();
    }
  };

  const flush = (taskId = task.id) => {
    clearTimer();
    if (savingRef.current) return;
    void drain(taskId);
  };

  const handleClose = () => {
    flush();
    onClose();
  };

  useEffect(() => {
    setSaveState('idle');
  }, [task.id]);

  useEffect(() => {
    return () => {
      flush(task.id);
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
                onClick={() => flush()}
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
              pendingRef.current = { taskId: task.id, value };
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
