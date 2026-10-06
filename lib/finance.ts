export type CashDateRange = { from: string; to: string };
export type FinanceTotals = {
  income: number;
  cost: number;
  net: number;
  expense: number;
  balance: number;
};

export function isCashDateRange(range: CashDateRange) {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= '0001-01-01' &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return valid(range.from) && valid(range.to) && range.from <= range.to;
}

export function summarizeCash(
  rows: ReadonlyArray<{ kind: string; value: number; cost?: number }>,
): FinanceTotals {
  let income = 0;
  let expense = 0;
  let cost = 0;
  for (const row of rows) {
    if (row.kind === 'in' || row.kind === 'payment') {
      income += Math.round(row.value * 100);
      cost += Math.round((row.cost || 0) * 100);
    } else expense += Math.round(row.value * 100);
  }
  return {
    income: income / 100,
    cost: cost / 100,
    net: (income - cost) / 100,
    expense: expense / 100,
    balance: (income - expense) / 100,
  };
}
