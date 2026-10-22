import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import { cn } from '../ui/utils';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false });
markdown.renderer.rules.image = (tokens, index) => escapeHtml(tokens[index]?.content ?? '');
markdown.renderer.rules.link_open = () => '';
markdown.renderer.rules.link_close = () => '';

interface MarkdownPreviewProps {
  value: string;
  className?: string;
}

export function MarkdownPreview({ value, className }: MarkdownPreviewProps) {
  const html = useMemo(() => markdown.render(value), [value]);
  return (
    <div
      className={cn('markdown-preview', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
