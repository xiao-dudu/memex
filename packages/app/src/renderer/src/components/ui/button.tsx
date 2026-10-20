import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30',
  {
    variants: {
      variant: {
        default: 'bg-[var(--ink)] text-[var(--bg)] hover:opacity-88 active:scale-[0.985]',
        accent: 'bg-[var(--accent)] text-white hover:brightness-105 active:scale-[0.985]',
        soft: 'bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-98',
        ghost: 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
        outline: 'border border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[var(--hover)]',
        danger: 'bg-red-600/10 text-red-600 hover:bg-red-600/15',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs',
        default: 'h-9 px-3.5',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
