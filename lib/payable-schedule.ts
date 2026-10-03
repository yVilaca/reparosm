import { nextPayableDueDate } from '@/lib/payable-recurrence';

export type DueGroup = 'overdue' | 'today' | 'week' | 'later' | 'undated';

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 48;

const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T12:00:00Z`) / 86_400_000;

/** Dias de `from` até `to` (negativo quando `to` já passou). */
export const daysUntil = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));

export function dueGroup(dueDate: string | undefined, today: string): DueGroup {
  if (!dueDate) return 'undated';
  const days = daysUntil(today, dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= 7 ? 'week' : 'later';
}

export function dueLabel(dueDate: string | undefined, today: string) {
  if (!dueDate) return 'Sem vencimento';
  const days = daysUntil(today, dueDate);
  if (days < -1) return `Venceu há ${-days} dias`;
  if (days === -1) return 'Venceu ontem';
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  if (days <= 7) return `Vence em ${days} dias`;
  const [year, month, day] = dueDate.split('-');
  return `Vence em ${day}/${month}${year === today.slice(0, 4) ? '' : `/${year}`}`;
}

/**
 * Parcelas iguais em centavos; o que sobra da divisão vai para a última.
 * null quando o plano não fecha (menos de 1 centavo por parcela ou
 * quantidade fora do limite).
 */
export function splitInstallments(total: number, count: number): number[] | null {
  const cents = Math.round(total * 100);
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) return null;
  const base = Math.floor(cents / count);
  if (base < 1) return null;
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? (cents - base * (count - 1)) / 100 : base / 100,
  );
}

/** Vencimentos mensais no mesmo dia da primeira parcela, ajustado ao fim de meses curtos. */
export function installmentDueDates(first: string, count: number): string[] {
  const anchor = Number(first.slice(8));
  const dates = [first];
  while (dates.length < count) {
    const next = nextPayableDueDate(dates[dates.length - 1], 'monthly', anchor);
    if (!next) break;
    dates.push(next);
  }
  return dates;
}
