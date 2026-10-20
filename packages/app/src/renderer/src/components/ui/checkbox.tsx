import { Check } from 'lucide-react';
import { cn } from './utils';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  label?: string;
}

export function Checkbox({ checked, onChange, className, label }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-all duration-150',
        checked
          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
          : 'border-[var(--line-strong)] bg-transparent hover:border-[var(--accent)]/60',
        className,
      )}
    >
      {checked ? <Check size={12} strokeWidth={3} /> : null}
    </button>
  );
}
