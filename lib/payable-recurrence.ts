export type PayableRecurrence = 'weekly' | 'monthly' | 'yearly';

export const recurrenceLabels: Record<PayableRecurrence, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export function isPayableDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isPayableRecurrence(value: unknown): value is PayableRecurrence {
  return value === 'weekly' || value === 'monthly' || value === 'yearly';
}

export function nextPayableDueDate(
  dueDate: string,
  recurrence: PayableRecurrence,
  anchorDay = Number(dueDate.slice(8)),
) {
  if (
    !isPayableDate(dueDate) ||
    !isPayableRecurrence(recurrence) ||
    !Number.isInteger(anchorDay) ||
    anchorDay < 1 ||
    anchorDay > 31
  )
    return null;
  const date = new Date(`${dueDate}T12:00:00Z`);
  if (recurrence === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + (recurrence === 'yearly' ? 12 : 1));
    const end = new Date(date);
    end.setUTCMonth(date.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(anchorDay, end.getUTCDate()));
  }
  return date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : null;
}
