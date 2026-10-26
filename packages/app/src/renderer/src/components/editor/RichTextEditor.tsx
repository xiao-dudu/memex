import { useEffect, useRef, type ReactNode } from 'react';
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

export interface RichTextChange {
  contentJson: string;
  plainText: string;
}

export interface RichTextEditorProps {
  /** 切换实体时用来重置内容（笔记 id / 任务 id）。 */
  documentKey: string;
  contentJson: string;
  placeholder?: string;
  /** 工具栏右侧的状态位，例如「保存中…」。 */
  status?: ReactNode;
  onChange: (payload: RichTextChange) => void;
  onBlur?: () => void;
}

function parseDocument(contentJson: string): JSONContent {
  try {
    const parsed = JSON.parse(contentJson) as JSONContent;
    return parsed?.type === 'doc' ? parsed : { type: 'doc', content: [{ type: 'paragraph' }] };
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
}

export function RichTextEditor({ documentKey, contentJson, placeholder, status, onChange, onBlur }: RichTextEditorProps) {
  // 回调每次都可能是新函数，用 ref 兜住，避免因为父组件重渲染把编辑器重建掉。
  const changeRef = useRef(onChange);
  const blurRef = useRef(onBlur);
  changeRef.current = onChange;
  blurRef.current = onBlur;
  const loadedKeyRef = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: placeholder ?? '从一个想法开始…' }),
      TaskList,
      TaskItem.configure({ nested: false }),
    ],
    content: parseDocument(contentJson),
    onUpdate: ({ editor: current }) => {
      const document = current.getJSON();
      changeRef.current({ contentJson: JSON.stringify(document), plainText: toPlainText(document) });
    },
    onBlur: () => blurRef.current?.(),
  });

  useEffect(() => {
    if (!editor || loadedKeyRef.current === documentKey) return;
    loadedKeyRef.current = documentKey;
    editor.commands.setContent(parseDocument(contentJson), { emitUpdate: false });
  }, [editor, documentKey, contentJson]);

  if (!editor) {
    return <div className="h-64 animate-pulse rounded-xl bg-[var(--hover)]" />;
  }

  const inlineTools = [
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
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)]/92 px-2 py-1.5 shadow-sm backdrop-blur">
        {inlineTools.map((tool) => {
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
        <span className="pr-1 text-[9.5px] text-[var(--faint)]">{status}</span>
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
  children: ReactNode;
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
