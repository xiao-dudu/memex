export interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
}

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'horizontalRule',
]);

export function toPlainText(document: TipTapNode | null | undefined): string {
  if (!document) return '';

  const render = (node: TipTapNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'taskItem') {
      const checked = Boolean(node.attrs?.checked);
      return `${checked ? '☑' : '☐'} ${(node.content ?? []).map(render).join('')}`;
    }
    if (node.type === 'listItem') {
      return `• ${(node.content ?? []).map(render).join('')}`;
    }
    const inner = (node.content ?? []).map(render).join('');
    return BLOCK_TYPES.has(node.type ?? '') ? `${inner}\n` : inner;
  };

  return render(document)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function emptyDocument(): string {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
}

export function textToDocument(text: string): string {
  const content = text
    .split(/\r?\n/)
    .map((line) =>
      line.length === 0
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] },
    );
  return JSON.stringify({ type: 'doc', content });
}
