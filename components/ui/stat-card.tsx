import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { Card, CardContent } from '@/components/ui/card';
import IconChip from '@/components/ui/icon-chip';
import { toneText, type Tone } from '@/components/ui/tone';

/**
 * Número de resumo com ícone no tom do que mede. O valor só ganha cor quando
 * `valueTone` é informado (vencido, negativo).
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
    <Card className={className} size="sm">
      <CardContent className="grid gap-1">
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
      </CardContent>
    </Card>
  );
}
