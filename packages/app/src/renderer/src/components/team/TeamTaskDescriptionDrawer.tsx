import { useEffect, useMemo, useRef, useState } from 'react';
import type { TeamTask } from '@memex/shared';
import { emptyDocument, textToDocument } from '../../lib/tiptap';
import { useTeamStore } from '../../store/useTeamStore';
import { Drawer } from '../ui/drawer';
import { RichTextEditor, type RichTextChange } from '../editor/RichTextEditor';

interface Props {
  task: TeamTask;
  open: boolean;
  onClose(): void;
}

function initialDocument(task: TeamTask): string {
  if (task.descriptionJson) return task.descriptionJson;
  if (task.description?.trim()) return textToDocument(task.description);
  return emptyDocument();
}

export function TeamTaskDescriptionDrawer({ task, open, onClose }: Props) {
  const updateTask = useTeamStore((state) => state.updateTask);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<RichTextChange | null>(null);
  const document = useMemo(
    () => initialDocument(task),
    [task.id, task.description, task.descriptionJson],
  );

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setSaveState('saving');
    void updateTask(task.id, {
      description: pending.plainText,
      descriptionJson: pending.contentJson,
      expectedVersion: task.version,
    }).then(() => {
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    });
  };

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, open]);

  return (
    <Drawer
      open={open}
      title="团队任务描述"
      description={task.title}
      onClose={onClose}
      footer={<span>{saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '自动保存'}</span>}
    >
      {open ? (
        <RichTextEditor
          documentKey={task.id}
          contentJson={document}
          placeholder="补充任务背景、交付标准或上下文…"
          onChange={(value) => {
            pendingRef.current = value;
            setSaveState('saving');
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(flush, 500);
          }}
          onBlur={flush}
        />
      ) : null}
    </Drawer>
  );
}
