/**
 * 发布说明是 GitHub 从提交生成的 Markdown（标题、`- ` 列表、空行）。
 * 这里只处理这三类，避免整段原样吐出来。
 */
export function ReleaseNotes({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-2" />;
        if (trimmed.startsWith('#')) {
          return (
            <p key={index} className="mt-1 text-[12px] font-semibold text-[var(--ink)]">
              {trimmed.replace(/^#+\s*/, '')}
            </p>
          );
        }
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <p key={index} className="flex gap-2 py-0.5 text-[12px] leading-5 text-[var(--muted)]">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--faint)]" />
              <span className="min-w-0">{trimmed.replace(/^[-*]\s*/, '')}</span>
            </p>
          );
        }
        return (
          <p key={index} className="break-words py-0.5 text-[12px] leading-5 text-[var(--muted)]">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
