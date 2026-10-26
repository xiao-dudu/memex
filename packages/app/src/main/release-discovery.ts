/** GitHub redirects /releases/latest to /releases/tag/<tag>. */
export function extractReleaseTag(finalUrl: string): string | null {
  if (!finalUrl) return null;
  const match = /\/releases\/tag\/([^/?#]+)/.exec(finalUrl);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildReleaseAssetUrl(
  owner: string,
  repo: string,
  tag: string,
  fileName: string,
): string {
  return `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(fileName)}`;
}

export function buildLatestReleaseUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/releases/latest`;
}

export function buildReleasePageUrl(owner: string, repo: string, tag: string): string {
  return `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`;
}

/**
 * Best-effort release notes extracted from the repository's Atom feed.
 *
 * GitHub puts the rendered release body in `<content type="html">` **escaped**
 * (`&lt;ul&gt;`), so entities must be decoded before tags can be stripped —
 * 先剥标签再解码会把 `<ul><li>` 原样漏到界面上。
 */
export function extractFirstReleaseNotes(xml: string): string {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
  if (!entry) return '';
  const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? '';
  return htmlToText(decodeEntities(content)).slice(0, 4000);
}

/** Converts the small subset of HTML GitHub emits into line-based plain text. */
export function htmlToText(html: string): string {
  const SOFT = '\u0001';
  const ITEM = '\u0000';

  const text = html
    // 链接保留目标地址：Atom 里的 <a> 文字常常被 GitHub 改写成版本号。
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const inner = label.replace(/<[^>]+>/g, '').trim();
      if (!inner) return href;
      return inner === href ? inner : `${inner} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    // 块级边界先换成占位符：直接换成换行的话，标签之间的缩进换行会让列表项之间多出空行。
    .replace(/<li\b[^>]*>/gi, SOFT + ITEM)
    .replace(/<\/(?:p|li|ul|ol|h[1-6]|blockquote|pre|div|tr)>/gi, SOFT)
    .replace(/<[^>]+>/g, '')
    .replace(new RegExp(`[ \\t]*${SOFT}[ \\t]*`, 'g'), SOFT)
    .replace(new RegExp(`${SOFT}\\s*${SOFT}`, 'g'), SOFT)
    .replace(new RegExp(`${SOFT}+`, 'g'), '\n')
    .replace(new RegExp(`\\n*${ITEM}`, 'g'), '\n- ');

  return text
    .split('\n')
    .map((line) => decodeEntities(line).replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
