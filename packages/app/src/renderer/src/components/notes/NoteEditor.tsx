import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { toPlainText } from '../../lib/tiptap';
import { cn } from '../ui/utils';
import { useAppStore } from '../../store/useAppStore';

interface NoteEditorProps {
  noteId: string;
  contentJson: string;
}

function parseDocument(contentJson: string): JSONContent {
  try {
    return JSON.parse(contentJson) as JSONContent;
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
}

export function NoteEditor({ noteId, contentJson }: NoteEditorProps) {
  const updateNote = useAppStore((state) => state.updateNote);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ contentJson: string; plainText: string } | null>(null);
  const loadedNoteRef = useRef<string | null>(null);

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: '从一个想法开始…' }),
      TaskList,
      TaskItem.configure({ nested: false }),
    ],
    content: parseDocument(contentJson),
    onUpdate: ({ editor: current }) => {
      const document = current.getJSON();
      pendingRef.current = { contentJson: JSON.stringify(document), plainText: toPlainText(document) };
      setSaveState('saving');
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, 500);
    },
    onBlur: () => flush(),
  });

  useEffect(() => {
    if (!editor || loadedNoteRef.current === noteId) return;
    loadedNoteRef.current = noteId;
    editor.commands.setContent(parseDocument(contentJson), { emitUpdate: false });
    setSaveState('idle');
  }, [editor, noteId, contentJson]);

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  if (!editor) {
    return <div className="h-64 animate-pulse rounded-xl bg-[var(--hover)]" />;
  }

  const tools = [
    { label: '粗体', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: '斜体', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: '删除线', icon: Strikethrough, active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
    { label: '行内代码', icon: Code2, active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
  ];

  const blockTools = [
    { label: '一级标题', icon: Heading1, active: editor.isActive('heading', { level: 1 }), run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: '二级标题', icon: Heading2, active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: '无序列表', icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: '有序列表', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: '任务清单', icon: ListChecks, active: editor.isActive('taskList'), run: () => editor.chain().focus().toggleTaskList().run() },
    { label: '引用', icon: Quote, active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
  ];

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 -mx-1 mb-5 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)]/92 px-2 py-1.5 shadow-sm backdrop-blur">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <ToolbarButton key={tool.label} label={tool.label} active={tool.active} onClick={tool.run}>
              <Icon size={14} />
            </ToolbarButton>
          );
        })}
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        {blockTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <ToolbarButton key={tool.label} label={tool.label} active={tool.active} onClick={tool.run}>
              <Icon size={14} />
            </ToolbarButton>
          );
        })}
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        <ToolbarButton label="撤销" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton label="重做" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={14} />
        </ToolbarButton>
        <span className="flex-1" />
        <span className="pr-1 text-[9.5px] text-[var(--faint)]">
          {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : ''}
        </span>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition',
        active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
        disabled ? 'opacity-30' : '',
      )}
    >
      {children}
    </button>
  );
}
