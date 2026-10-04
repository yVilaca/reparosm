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

type Bill = {
  amount: number;
  dueDate?: string;
  status?: 'pending' | 'paid';
  paidOn?: string;
  paidAmount?: number;
  description: string;
  supplier?: string;
  category?: string;
};
type Total = { amount: number; count: number };

const total = (values: number[]) =>
  values.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100;
const sumOf = (rows: Bill[], value: (row: Bill) => number): Total => ({
  amount: total(rows.map(value)),
  count: rows.length,
});
const isOpen = (row: Bill) => row.status !== 'paid';
const paidValue = (row: Bill) => row.paidAmount ?? row.amount;

/** Os três números do topo: o que venceu, o que vence em até 7 dias e o que foi pago no mês. */
export function summarizePayables(rows: Bill[], today: string) {
  const open = rows.filter(isOpen);
  const month = today.slice(0, 7);
  return {
    overdue: sumOf(
      open.filter((row) => dueGroup(row.dueDate, today) === 'overdue'),
      (row) => row.amount,
    ),
    upcoming: sumOf(
      open.filter((row) => ['today', 'week'].includes(dueGroup(row.dueDate, today))),
      (row) => row.amount,
    ),
    paidThisMonth: sumOf(
      rows.filter((row) => !isOpen(row) && row.paidOn?.startsWith(month)),
      paidValue,
    ),
  };
}

const dueOrder: DueGroup[] = ['overdue', 'today', 'week', 'later', 'undated'];

/** Contas em aberto por urgência, cada grupo com seu total; grupos vazios ficam de fora. */
export function groupOpenPayables<T extends Bill>(rows: T[], today: string) {
  const open = rows
    .filter(isOpen)
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  return dueOrder
    .map((group) => {
      const items = open.filter((row) => dueGroup(row.dueDate, today) === group);
      return { group, total: total(items.map((row) => row.amount)), rows: items };
    })
    .filter((group) => group.rows.length > 0);
}

const monthName = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
/** "2026-10" → "Outubro de 2026". */
export const monthLabel = (month: string) => {
  const label = monthName.format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** Contas pagas pelo mês do pagamento, do mais recente para o mais antigo. */
export function groupPaidPayables<T extends Bill>(rows: T[]) {
  const paid = rows
    .filter((row) => !isOpen(row))
    .sort((a, b) => (b.paidOn || '').localeCompare(a.paidOn || ''));
  const months = [...new Set(paid.map((row) => (row.paidOn || '').slice(0, 7)))];
  return months.map((month) => {
    const items = paid.filter((row) => (row.paidOn || '').slice(0, 7) === month);
    return {
      month,
      label: month ? monthLabel(month) : 'Sem data',
      total: total(items.map(paidValue)),
      rows: items,
    };
  });
}

/** Texto sem acentos e em minúsculas, para busca. */
export const plainText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Busca por descrição, fornecedor ou categoria, sem diferenciar acentos e maiúsculas. */
export function matchesPayable(row: Bill, query: string) {
  const wanted = plainText(query.trim());
  if (!wanted) return true;
  return [row.description, row.supplier, row.category].some(
    (text) => text && plainText(text).includes(wanted),
  );
}
