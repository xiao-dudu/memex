import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { emptyDocument, textToDocument } from '../../lib/tiptap';
import { Drawer } from '../ui/drawer';
import { RichTextEditor, type RichTextChange } from '../editor/RichTextEditor';

interface TaskDescriptionDrawerProps {
  task: Task;
  open: boolean;
  onClose: () => void;
}

/** 老任务只有纯文本描述，打开抽屉时现算成文档，用户一编辑就落成 JSON。 */
function initialDocument(task: Task): string {
  if (task.descriptionJson) return task.descriptionJson;
  if (task.description && task.description.trim()) return textToDocument(task.description);
  return emptyDocument();
}

export function TaskDescriptionDrawer({ task, open, onClose }: TaskDescriptionDrawerProps) {
  const updateTask = useAppStore((state) => state.updateTask);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [length, setLength] = useState(0);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<RichTextChange | null>(null);

  const document = useMemo(() => initialDocument(task), [task.id, task.descriptionJson, task.description]);

  useEffect(() => {
    setLength((task.description ?? '').length);
  }, [task.id, task.description]);

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setSaveState('saving');
    void updateTask(task.id, { descriptionJson: pending.contentJson, description: pending.plainText }).then(() => {
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    });
  };

  const handleChange = (payload: RichTextChange) => {
    pendingRef.current = payload;
    setLength(payload.plainText.length);
    setSaveState('saving');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 500);
  };

  // 关闭抽屉或切换任务时把未落库的草稿冲掉，避免丢字。
  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, open]);

  return (
    <Drawer
      open={open}
      title="任务描述"
      description={task.title}
      onClose={onClose}
      footer={
        <>
          <span>{length > 0 ? `${length} 字` : '暂无描述'}</span>
          <span className="flex-1" />
          <span>{saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '自动保存'}</span>
        </>
      }
    >
      {open ? (
        <RichTextEditor
          documentKey={task.id}
          contentJson={document}
          placeholder="补充描述、上下文或下一步…"
          onChange={handleChange}
          onBlur={flush}
        />
      ) : null}
    </Drawer>
  );
}
