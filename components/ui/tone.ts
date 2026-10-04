/**
 * Tons com significado fixo em toda a aplicação (veja
 * docs/superpowers/specs/2026-10-03-linguagem-visual-design.md):
 * neutro = normal/novo, informação = em andamento, sucesso = pronto/entra,
 * atenção = esperando/em breve, problema = atrasado/sai, marca = ação principal.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

/** Círculo tingido com ícone. */
export const toneChip: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  brand: 'bg-primary/10 text-primary',
};

/** Texto no tom (valores e situações). */
export const toneText: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-sky-700 dark:text-sky-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-destructive',
  brand: 'text-primary',
};

/** Ponto de legenda e de contagem. */
export const toneDot: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/40',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  brand: 'bg-primary',
};

/** Fundo suave de destaque (faixas e avisos). */
export const toneSurface: Record<Tone, string> = {
  neutral: 'bg-muted/40 ring-foreground/10',
  info: 'bg-sky-500/5 ring-sky-500/20',
  success: 'bg-emerald-500/5 ring-emerald-500/20',
  warning: 'bg-amber-500/5 ring-amber-500/25',
  danger: 'bg-rose-500/5 ring-rose-500/20',
  brand: 'bg-primary/5 ring-primary/15',
};

/** Variante de etiqueta (Badge) para cada tom. */
export const toneBadge = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  brand: 'secondary',
} as const satisfies Record<Tone, string>;
