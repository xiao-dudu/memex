import { describe, expect, it } from 'vitest';
import { normalizeText, textToDocument, toPlainText, type TipTapNode } from '../documents.js';

function parse(text: string): TipTapNode {
  return JSON.parse(textToDocument(text)) as TipTapNode;
}

describe('normalizeText', () => {
  it('统一换行并去掉尾部空白', () => {
    expect(normalizeText('a\r\nb\r\n\r\n')).toBe('a\nb');
  });
});

describe('textToDocument', () => {
  it('每个非空行转成段落', () => {
    const doc = parse('第一行\n\n第二行');
    expect(doc.content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph']);
    expect(doc.content?.[0]?.content?.[0]?.text).toBe('第一行');
  });

  it('空文本得到空文档', () => {
    expect(parse('').content).toEqual([]);
  });

  it('识别标题层级', () => {
    const doc = parse('# 一级\n### 三级');
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(doc.content?.[1]).toMatchObject({ type: 'heading', attrs: { level: 3 } });
  });

  it('连续条目合并成一个列表，任务列表优先于无序列表', () => {
    const doc = parse('- 普通\n- [ ] 待办\n- [x] 已完成\n1. 第一\n2. 第二');
    expect(doc.content?.map((node) => node.type)).toEqual(['bulletList', 'taskList', 'orderedList']);
    expect(doc.content?.[1]?.content?.map((node) => node.attrs?.checked)).toEqual([false, true]);
  });

  it('引用块内每行单独成段', () => {
    const doc = parse('> 第一句\n> 第二句');
    expect(doc.content?.[0]?.type).toBe('blockquote');
    expect(doc.content?.[0]?.content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('代码块保留原始内容且不解析内联标记', () => {
    const doc = parse('```ts\nconst a = **1**;\n```');
    expect(doc.content?.[0]).toMatchObject({ type: 'codeBlock', attrs: { language: 'ts' } });
    expect(doc.content?.[0]?.content?.[0]?.text).toBe('const a = **1**;');
  });

  it('未闭合的代码块也能收尾', () => {
    const doc = parse('```\n未闭合');
    expect(doc.content?.[0]?.type).toBe('codeBlock');
  });

  it('分隔线转成 horizontalRule', () => {
    expect(parse('---').content?.[0]?.type).toBe('horizontalRule');
  });

  it('内联粗体、斜体、行内代码转成 marks', () => {
    const doc = parse('**粗** *斜* `码`');
    const nodes = doc.content?.[0]?.content ?? [];
    expect(nodes.map((node) => node.marks?.[0]?.type ?? 'plain')).toEqual(['bold', 'plain', 'italic', 'plain', 'code']);
  });

  it('snake_case 不会被误判成斜体', () => {
    const doc = parse('use_snake_case_name 保持原样');
    const nodes = doc.content?.[0]?.content ?? [];
    expect(nodes.every((node) => node.marks === undefined)).toBe(true);
  });
});

describe('toPlainText', () => {
  it('标题与列表渲染成不带标记的纯文本', () => {
    const doc = parse('# 周会\n\n- 事项\n- [x] 完成');
    const text = toPlainText(doc);
    expect(text).toBe('周会\n• 事项\n\n☑ 完成');
  });
});
