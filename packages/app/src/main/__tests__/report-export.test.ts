// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Report } from '@memex/shared';
import { renderMarkdownHtml, reportFileName } from '../report-export';

const report = {
  title: 'A/B',
  periodStart: new Date(2026, 9, 13).getTime(),
  periodEnd: new Date(2026, 9, 20).getTime(),
} as Report;

describe('report export', () => {
  it('builds a Windows-safe filename with an inclusive local end date', () => {
    expect(reportFileName(report)).toBe('2026-10-13-2026-10-19-A-B.md');
    expect(
      reportFileName({
        ...report,
        title: '  周报: "项目" / 总结? * <最终> |  ',
      } as Report),
    ).toBe('2026-10-13-2026-10-19-周报-项目-总结-最终.md');
  });

  it('uses the required stem for a default report title', () => {
    expect(reportFileName({ ...report, title: '2026-10-13 至 2026-10-19 周报' } as Report)).toBe(
      '2026-10-13-2026-10-19-周报.md',
    );
  });
  it('renders Markdown while escaping raw HTML', () => {
    const html = renderMarkdownHtml('# 标题\n<script>alert(1)</script>\n\n- 项目');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<li>项目</li>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not emit external image or link targets', () => {
    const html = renderMarkdownHtml('[链接](https://example.com)\n\n![截图](https://example.com/a.png)');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('<img');
    expect(html).toContain('链接');
    expect(html).toContain('截图');
  });
});
