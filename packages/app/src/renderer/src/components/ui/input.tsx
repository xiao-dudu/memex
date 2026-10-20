import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/10',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-6 text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/10',
        className,
      )}
      {...props}
    />
  );
}
