import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useAppStore } from '../../store/useAppStore';
import { RichTextEditor, type RichTextChange } from '../editor/RichTextEditor';

interface NoteEditorProps {
  noteId: string;
  title: string;
  contentJson: string;
}

/**
 * 页头已经展示了标题，正文若以一级标题重复同一句话，标题会出现两次。
 * 这里只在渲染层去掉该节点：用户不编辑就不会写回数据库，编辑后自然归一。
 */
function stripLeadingTitle(contentJson: string, title: string): string {
  let doc: JSONContent;
  try {
    doc = JSON.parse(contentJson) as JSONContent;
  } catch {
    return contentJson;
  }

  const first = doc.content?.[0];
  if (!first || first.type !== 'heading' || first.attrs?.level !== 1) return contentJson;
  const text = (first.content ?? []).map((node) => node.text ?? '').join('').trim();
  const heading = title.trim();
  if (!heading || text !== heading) return contentJson;

  const rest = (doc.content ?? []).slice(1);
  return JSON.stringify({ ...doc, content: rest.length > 0 ? rest : [{ type: 'paragraph' }] });
}

export function NoteEditor({ noteId, title, contentJson }: NoteEditorProps) {
  const updateNote = useAppStore((state) => state.updateNote);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<RichTextChange | null>(null);

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setSaveState('saving');
    void updateNote(noteId, pending).then(() => {
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    });
  };

  const handleChange = (payload: RichTextChange) => {
    pendingRef.current = payload;
    setSaveState('saving');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 500);
  };

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return (
    <RichTextEditor
      documentKey={noteId}
      contentJson={stripLeadingTitle(contentJson, title)}
      placeholder="从一个想法开始…"
      status={saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : ''}
      onChange={handleChange}
      onBlur={flush}
    />
  );
}
