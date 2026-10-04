import type { ReactNode } from 'react';
import { cn } from 'cn';
import { toneText, type Tone } from '@/components/ui/tone';

/**
 * Grupo de uma lista (ex.: "Atrasados", "Esperando resposta"): título, contagem,
 * um resumo à direita (totais) e as linhas num cartão com divisórias.
 */
export function ListGroup({
  title,
  count,
  hint,
  tone,
  aside,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  /** Só "danger" pinta o título: o grupo é um problema. */
  tone?: Tone;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-2">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 className={cn('text-sm font-semibold', tone === 'danger' && 'text-destructive')}>
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>
          )}
          {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
        </h2>
        {aside && <div className="flex gap-3 text-sm font-medium tabular-nums">{aside}</div>}
      </header>
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {children}
      </ul>
    </section>
  );
}

/**
 * Linha de lista: ícone, título e contexto à esquerda; valor e situação à
 * direita; uma ação visível e o menu "…". No celular, título na primeira linha
 * e valor com ações juntos na segunda.
 */
export function ListRow({
  leading,
  srPrefix,
  title,
  details,
  value,
  valueClassName,
  note,
  noteTone,
  actions,
}: {
  leading?: ReactNode;
  /** Prefixo só para leitores de tela (ex.: "Receber: "). */
  srPrefix?: string;
  title: ReactNode;
  details?: ReactNode;
  value?: ReactNode;
  valueClassName?: string;
  note?: ReactNode;
  noteTone?: Tone;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-64">
        {leading}
        <div className="min-w-0">
          <p className="font-medium break-words">
            {srPrefix && <span className="sr-only">{srPrefix}</span>}
            {title}
          </p>
          {details && <p className="text-sm break-words text-muted-foreground">{details}</p>}
        </div>
      </div>
      {(value !== undefined || note) && (
        <div
          className={cn(
            'min-w-0 flex-1 sm:flex-none sm:text-right',
            leading ? 'pl-11 sm:pl-0' : undefined,
          )}
        >
          {value !== undefined && (
            <p className={cn('font-semibold tabular-nums', valueClassName)}>{value}</p>
          )}
          {note && (
            <p
              className={cn(
                'text-xs',
                noteTone === 'danger' || noteTone === 'warning'
                  ? cn('font-medium', toneText[noteTone])
                  : noteTone
                    ? toneText[noteTone]
                    : 'text-muted-foreground',
              )}
            >
              {note}
            </p>
          )}
        </div>
      )}
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </li>
  );
}
