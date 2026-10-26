/**
 * MCP 侧没有 TipTap 运行时，这里用一份最小实现把 AI 写入的 Markdown 文本
 * 转成与 app 同构的 ProseMirror 文档 JSON，避免笔记在编辑器里显示成原始符号。
 */

export interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
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

const FENCE = /^```\s*([\w+-]*)\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const TASK_ITEM = /^[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_ITEM = /^[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

// 内联只处理粗体、斜体、行内代码；嵌套格式按最外层匹配，不做递归。
const INLINE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<!\w)__[^_\n]+__(?!\w)|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w))/g;

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

export function textToDocument(text: string): string {
  return JSON.stringify({ type: 'doc', content: parseBlocks(normalizeText(text)) });
}

/** 与 app 的 toPlainText 保持一致：用于生成摘要、搜索文本和默认标题。 */
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

function textBlock(type: string, text: string, attrs?: Record<string, unknown>): TipTapNode {
  const content = parseInline(text);
  const node: TipTapNode = { type };
  if (attrs) node.attrs = attrs;
  if (content.length > 0) node.content = content;
  return node;
}

function parseBlocks(text: string): TipTapNode[] {
  const lines = text.split('\n');
  const blocks: TipTapNode[] = [];
  let index = 0;

  const collect = (
    pattern: RegExp,
    build: (match: RegExpMatchArray) => TipTapNode | null,
    exclude?: RegExp,
  ): TipTapNode[] => {
    const items: TipTapNode[] = [];
    while (index < lines.length) {
      const line = (lines[index] ?? '').trim();
      if (exclude?.test(line)) break;
      const match = line.match(pattern);
      if (!match) break;
      const node = build(match);
      if (node) items.push(node);
      index += 1;
    }
    return items;
  };

  while (index < lines.length) {
    const trimmed = (lines[index] ?? '').trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(FENCE);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test((lines[index] ?? '').trim())) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // 跳过结束围栏；围栏未闭合时也不会越界
      blocks.push({
        type: 'codeBlock',
        attrs: { language: fence[1] || null },
        ...(code.length > 0 ? { content: [{ type: 'text', text: code.join('\n') }] } : {}),
      });
      continue;
    }

    if (RULE.test(trimmed)) {
      blocks.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    const heading = trimmed.match(HEADING);
    if (heading) {
      blocks.push(textBlock('heading', heading[2] ?? '', { level: (heading[1] ?? '#').length }));
      index += 1;
      continue;
    }

    // 任务列表必须排在无序列表之前判断，否则 `- [ ]` 会被当成普通条目。
    if (TASK_ITEM.test(trimmed)) {
      const items = collect(TASK_ITEM, (match) => ({
        type: 'taskItem',
        attrs: { checked: (match[1] ?? '').toLowerCase() === 'x' },
        content: [textBlock('paragraph', match[2] ?? '')],
      }));
      blocks.push({ type: 'taskList', content: items });
      continue;
    }

    if (BULLET_ITEM.test(trimmed)) {
      // 遇到 `- [ ]` 就断开：任务项属于 taskList，不能混进普通无序列表。
      const items = collect(
        BULLET_ITEM,
        (match) => ({
          type: 'listItem',
          content: [textBlock('paragraph', match[1] ?? '')],
        }),
        TASK_ITEM,
      );
      blocks.push({ type: 'bulletList', content: items });
      continue;
    }

    if (ORDERED_ITEM.test(trimmed)) {
      const items = collect(ORDERED_ITEM, (match) => ({
        type: 'listItem',
        content: [textBlock('paragraph', match[1] ?? '')],
      }));
      blocks.push({ type: 'orderedList', content: items });
      continue;
    }

    if (QUOTE.test(trimmed)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? '').trim().match(QUOTE);
        if (!match) break;
        quoted.push(match[1] ?? '');
        index += 1;
      }
      // 文本节点不能含换行，引用块里每行单独成段。
      blocks.push({ type: 'blockquote', content: quoted.map((line) => textBlock('paragraph', line)) });
      continue;
    }

    blocks.push(textBlock('paragraph', trimmed));
    index += 1;
  }

  return blocks;
}

function parseInline(text: string): TipTapNode[] {
  if (!text) return [];
  const nodes: TipTapNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push({ type: 'text', text: text.slice(cursor, start) });
    const raw = match[0];
    const mark = raw.startsWith('**') || raw.startsWith('__') ? 'bold' : raw.startsWith('`') ? 'code' : 'italic';
    const width = mark === 'bold' ? 2 : 1;
    nodes.push({ type: 'text', text: raw.slice(width, raw.length - width), marks: [{ type: mark }] });
    cursor = start + raw.length;
  }

  if (cursor < text.length) nodes.push({ type: 'text', text: text.slice(cursor) });
  return nodes;
}
