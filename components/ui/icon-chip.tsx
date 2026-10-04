import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { toneChip, type Tone } from '@/components/ui/tone';

const sizes = {
  sm: 'size-6 [&_svg]:size-3.5',
  md: 'size-8 [&_svg]:size-4',
  lg: 'size-10 [&_svg]:size-5',
};

/** Ícone num círculo tingido: diz de relance de que tipo é a coisa. */
export default function IconChip({
  icon: Icon,
  tone = 'neutral',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        sizes[size],
        toneChip[tone],
        className,
      )}
    >
      <Icon />
    </span>
  );
}
