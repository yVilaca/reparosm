import { cn } from 'cn';

const sizes = {
  sm: 'h-5 text-[11px] [&>[aria-hidden]]:px-1.5',
  md: 'h-6 text-xs [&>[aria-hidden]]:px-2',
};

/**
 * O código de uma OS ou orçamento como a etiqueta colada no aparelho: o tipo
 * (OS, ORC) apagado e o número em destaque, separados por um picote. Leitores
 * de tela ouvem o código inteiro ("OS-50").
 */
export default function RefTag({
  code,
  size = 'sm',
  className,
}: {
  code: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const dash = code.indexOf('-');
  if (dash <= 0 || dash === code.length - 1)
    return <span className={cn('font-display font-bold tabular-nums', className)}>{code}</span>;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-stretch overflow-hidden rounded-[5px] bg-card align-middle font-display leading-none tabular-nums ring-1 ring-foreground/15',
        sizes[size],
        className,
      )}
    >
      <span className="sr-only">{code}</span>
      <span aria-hidden="true" className="flex items-center font-semibold text-muted-foreground">
        {code.slice(0, dash)}
      </span>
      <span
        aria-hidden="true"
        className="flex items-center border-l border-dashed border-foreground/25 font-bold text-foreground"
      >
        {code.slice(dash + 1)}
      </span>
    </span>
  );
}
