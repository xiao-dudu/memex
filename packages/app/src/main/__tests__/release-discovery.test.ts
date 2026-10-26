import { describe, expect, it } from 'vitest';
import { buildReleaseAssetUrl, extractFirstReleaseNotes, extractReleaseTag, htmlToText } from '../release-discovery';

describe('extractReleaseTag', () => {
  it('reads the tag from a followed release URL', () => {
    expect(extractReleaseTag('https://github.com/xiao-dudu/memex/releases/tag/v1.1.7')).toBe('v1.1.7');
  });

  it('decodes an encoded tag', () => {
    expect(extractReleaseTag('https://github.com/o/r/releases/tag/v1.0.0-beta.1')).toBe('v1.0.0-beta.1');
  });

  it('returns null when the URL is not a release tag page', () => {
    expect(extractReleaseTag('https://github.com/xiao-dudu/memex/releases')).toBeNull();
    expect(extractReleaseTag('')).toBeNull();
  });

  it('ignores query strings and fragments', () => {
    expect(extractReleaseTag('https://github.com/o/r/releases/tag/v2.0.0?x=1#notes')).toBe('v2.0.0');
  });
});

describe('buildReleaseAssetUrl', () => {
  it('builds a download URL with an encoded file name', () => {
    expect(buildReleaseAssetUrl('o', 'r', 'v1.1.7', 'Memex-Setup-1.1.7.exe')).toBe(
      'https://github.com/o/r/releases/download/v1.1.7/Memex-Setup-1.1.7.exe',
    );
  });

  it('encodes spaces in the file name', () => {
    expect(buildReleaseAssetUrl('o', 'r', 'v1', 'Memex Setup.exe')).toBe(
      'https://github.com/o/r/releases/download/v1/Memex%20Setup.exe',
    );
  });
});

describe('extractFirstReleaseNotes', () => {
  const atom = `<feed><entry><id>tag:github.com,2008:Repository/1/v1.5.0</id>
<content type="html">&lt;ul&gt;
&lt;li&gt;新增 create_task 与 create_note 工具&lt;/li&gt;
&lt;/ul&gt;
&lt;p&gt;完整变更： &lt;a class="commit-link" href="https://github.com/o/r/compare/v1.4.3...v1.5.0"&gt;&lt;tt&gt;v1.4.3...v1.5.0&lt;/tt&gt;&lt;/a&gt;&lt;/p&gt;</content>
</entry></feed>`;

  it('转义 HTML 先解码再剥标签，界面上不再出现 <ul>', () => {
    const notes = extractFirstReleaseNotes(atom);
    expect(notes).not.toContain('<');
    expect(notes).not.toContain('&lt;');
    expect(notes).toContain('- 新增 create_task 与 create_note 工具');
    expect(notes).toContain('完整变更： v1.4.3...v1.5.0 (https://github.com/o/r/compare/v1.4.3...v1.5.0)');
  });

  it('保留段落与列表之间的换行', () => {
    expect(extractFirstReleaseNotes(atom).split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('纯文本正文原样保留', () => {
    const plain = '<feed><entry><content type="html">第一行\n\n第二行</content></entry></feed>';
    expect(extractFirstReleaseNotes(plain)).toBe('第一行\n\n第二行');
  });

  it('没有 entry 时返回空串', () => {
    expect(extractFirstReleaseNotes('<feed></feed>')).toBe('');
  });
});

describe('htmlToText', () => {
  it('列表项转成 - 前缀，标题与引用按行断开', () => {
    expect(htmlToText('<h2>标题</h2><ul><li>A</li><li>B</li></ul><blockquote>引用</blockquote>')).toBe(
      '标题\n- A\n- B\n引用',
    );
  });

  it('链接文字与地址相同时只保留一次', () => {
    expect(htmlToText('<p><a href="https://x.test">https://x.test</a></p>')).toBe('https://x.test');
  });

  it('解码常见实体且不重复解码 &amp;', () => {
    expect(htmlToText('<p>a &amp; b &lt;tag&gt;</p>')).toBe('a & b <tag>');
  });

  it('把 <br> 当换行而不是空格', () => {
    expect(htmlToText('第一行<br>第二行')).toBe('第一行\n第二行');
  });
});
