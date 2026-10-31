import type { TeamMember } from '@memex/shared';
import { cn } from '../ui/utils';

interface Props {
  label: string;
  value: string[];
  options: TeamMember[];
  onChange(value: string[]): void;
}

export function TeamMemberPicker({ label, value, options, onChange }: Props) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <fieldset className="space-y-2">
      <legend className="text-[12px] font-medium text-[var(--muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((member) => (
          <label
            key={member.id}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] focus-within:ring-2 focus-within:ring-[var(--accent)]/30',
              value.includes(member.id)
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--surface-2)]',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={value.includes(member.id)}
              onChange={() => toggle(member.id)}
              aria-label={`${label}-${member.displayName}`}
            />
            {member.displayName}
            <span className="text-[10px] opacity-60">{member.role === 'leader' ? '负责人' : '成员'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
