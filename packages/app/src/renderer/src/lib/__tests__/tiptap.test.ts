import { describe, expect, it } from 'vitest';
import { toPlainText, textToDocument } from '../tiptap';

describe('tiptap plain text projection', () => {
  it('projects headings, paragraphs and lists to readable text', () => {
    const document = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '会议记录' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '确认下一步安排。' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一条' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第二条' }] }] },
          ],
        },
      ],
    };
    const text = toPlainText(document);
    expect(text).toContain('会议记录');
    expect(text).toContain('确认下一步安排。');
    expect(text).toContain('• 第一条');
    expect(text).toContain('• 第二条');
  });

  it('creates a paragraph document from plain text', () => {
    const parsed = JSON.parse(textToDocument('第一行\n第二行')) as { content: unknown[] };
    expect(parsed.content).toHaveLength(2);
  });
});
