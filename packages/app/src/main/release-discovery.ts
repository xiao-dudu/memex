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

/** Best-effort release notes extracted from the repository's Atom feed. */
export function extractFirstReleaseNotes(xml: string): string {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
  if (!entry) return '';
  const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? '';
  return decodeEntities(content.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
