'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';

/** Filtros em pílulas: a ativa fica escura. Nunca roxo. */
export default function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string; count?: number; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div aria-label={label} className={cn('flex flex-wrap gap-1.5', className)} role="group">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              selected
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
            aria-pressed={selected}
          >
            {Icon && <Icon aria-hidden="true" className="size-3.5" />}
            {option.label}
            {option.count !== undefined && (
              <span className={cn('text-xs tabular-nums', !selected && 'text-muted-foreground')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
