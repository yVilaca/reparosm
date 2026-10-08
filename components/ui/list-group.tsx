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
  dense = false,
  onOpen,
  openLabel,
}: {
  /** Abre o registro: a linha toda fica clicável e o título vira o botão. */
  onOpen?: () => void;
  /** Nome acessível do botão de abrir (ex.: "Ver orçamento ORC-19"). */
  openLabel?: string;
  /** Tudo numa linha só, para listas estreitas (colunas laterais). */
  dense?: boolean;
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
    <li
      className={cn(
        'flex items-center gap-x-3 gap-y-2 px-4 py-3',
        dense ? 'flex-nowrap' : 'flex-wrap',
        onOpen && 'relative transition-colors hover:bg-muted/40',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-3',
          dense ? 'flex-1' : 'basis-full sm:flex-1 sm:basis-64',
        )}
      >
        {leading}
        <div className="min-w-0">
          <p className="font-medium break-words">
            {srPrefix && <span className="sr-only">{srPrefix}</span>}
            {onOpen ? (
              <button
                aria-label={openLabel}
                // A área clicável cobre a linha; valor e ações ficam por cima.
                className="rounded-sm text-left underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={onOpen}
                type="button"
              >
                {title}
              </button>
            ) : (
              title
            )}
          </p>
          {details && <p className="text-sm break-words text-muted-foreground">{details}</p>}
        </div>
      </div>
      {(value !== undefined || note) && (
        <div
          className={cn(
            dense ? 'shrink-0 text-right' : 'min-w-0 flex-1 sm:flex-none sm:text-right',
            leading && !dense ? 'pl-11 sm:pl-0' : undefined,
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
      {actions && (
        <div className={cn('relative z-10 flex items-center gap-1', !dense && 'ml-auto')}>
          {actions}
        </div>
      )}
    </li>
  );
}
