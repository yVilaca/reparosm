'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /** Quando a opção leva a outra página em vez de mudar o estado. */
  href?: string;
};

const item =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4';
const active = 'bg-background text-foreground shadow-sm';
const idle = 'text-muted-foreground hover:text-foreground';

/** Alternância entre visões (abas): fundo cinza, opção ativa em branco. Nunca roxo. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  stretch = false,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Nome do grupo para leitores de tela. */
  label: string;
  /** Ocupa a largura toda, com opções do mesmo tamanho. */
  stretch?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        'max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1',
        stretch ? 'flex w-full' : 'inline-flex w-fit',
        className,
      )}
      role="group"
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        const content = (
          <>
            {Icon && <Icon aria-hidden="true" />}
            {option.label}
            {option.count !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
            )}
          </>
        );
        const classes = cn(item, selected ? active : idle, stretch && 'flex-1');
        return option.href ? (
          <Link
            aria-current={selected ? 'page' : undefined}
            className={classes}
            href={option.href}
            key={option.value}
          >
            {content}
          </Link>
        ) : (
          <button
            aria-pressed={selected}
            className={classes}
            key={option.value}
            onClick={() => onChange?.(option.value)}
            type="button"
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
