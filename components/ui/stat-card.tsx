import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import IconChip from '@/components/ui/icon-chip';
import { toneText, type Tone } from '@/components/ui/tone';

/**
 * Faixa de resumo: os números de uma tela numa superfície só, separados por
 * filetes, em vez de cartões soltos. As colunas vêm de `className`
 * (ex.: `grid-cols-2 xl:grid-cols-4`).
 */
export function StatGroup({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      {...props}
      className={cn(
        // O fundo da faixa é a cor do filete; o gap de 1px entre as células o revela.
        'grid gap-px overflow-hidden rounded-xl bg-border shadow-[0_1px_2px_rgb(27_22_54/0.04)] ring-1 ring-border dark:shadow-none',
        className,
      )}
    />
  );
}

/**
 * Número de resumo com ícone no tom do que mede. O valor só ganha cor quando
 * `valueTone` é informado (vencido, negativo). Vai dentro de `StatGroup`.
 */
export default function StatCard({
  icon,
  tone = 'neutral',
  label,
  value,
  valueTone,
  detail,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: ReactNode;
  valueTone?: Tone;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid content-start gap-1 bg-card p-3 text-sm sm:p-4', className)}>
      <div className="flex items-center gap-2">
        <IconChip icon={icon} size="sm" tone={tone} />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <strong
        className={cn(
          'mt-1 font-display text-xl font-bold tracking-tight tabular-nums sm:text-[1.75rem]',
          valueTone && toneText[valueTone],
        )}
      >
        {value}
      </strong>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}
