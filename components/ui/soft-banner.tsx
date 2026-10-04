import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import IconChip from '@/components/ui/icon-chip';
import { toneSurface, type Tone } from '@/components/ui/tone';

/** Destaque suave com ícone, no lugar de faixas cheias de cor. */
export default function SoftBanner({
  icon,
  tone = 'brand',
  eyebrow,
  title,
  description,
  action,
  className,
  children,
}: {
  icon: LucideIcon;
  tone?: Tone;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-xl p-4 ring-1 sm:flex-row sm:items-center',
        toneSurface[tone],
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconChip icon={icon} size="lg" tone={tone} />
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {eyebrow}
            </p>
          )}
          <h2 className="font-semibold">{title}</h2>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
          {children}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </section>
  );
}
