import { nextPayableDueDate, type PayableRecurrence } from '@/lib/payable-recurrence';

/**
 * Previsão do mês: onde o lucro deve fechar se o resto do mês seguir o ritmo da
 * loja. Soma o que já aconteceu no caixa, estima as vendas dos dias que faltam
 * pela média de cada dia da semana nas últimas 8 semanas, os gastos avulsos pela
 * média por dia (sem os dias atípicos) e desconta pelo valor exato as contas a
 * pagar que vencem até o fim do mês. Tudo em regime de caixa, com as
 * mesmas definições do Início: faturamento (entradas), margem (faturamento
 * menos o custo das peças) e lucro (margem menos as saídas).
 */

/** Movimento de um dia. Saídas separadas: contas cadastradas e avulsas. */
export type DayTotals = {
  day: string;
  income: number;
  cost: number;
  /** Saídas sem conta a pagar (gastos do dia a dia): entram pelo ritmo. */
  looseExpense: number;
  /**
   * Saídas que pagaram uma conta cadastrada: já previstas pelo valor exato.
   * Compras (peças, materiais) não entram: o custo das peças já sai de cada OS.
   */
  billExpense: number;
};

export type PendingBill = {
  amount: number;
  dueDate: string;
  recurrence?: PayableRecurrence;
  recurrenceDay?: number;
};

export type ForecastInput = {
  asOfDate: string;
  /** Dias com movimento, do início da janela até hoje (os sem movimento podem faltar). */
  days: DayTotals[];
  /** Primeiro dia com movimento na loja (para não contar semanas antes de existir). */
  firstActivity?: string;
  pendingBills: PendingBill[];
  /** OS prontas esperando pagamento: o que falta receber e a margem disso. */
  ready: { income: number; margin: number };
};

export type Confidence = 'none' | 'low' | 'ok';

/** Lucro acumulado no mês até o fim do dia: realizado até hoje, projeção de hoje em diante. */
export type ForecastPoint = { day: string; actual: number | null; projected: number | null };

export type MonthForecast = {
  month: string;
  /** Dias que faltam depois de hoje. */
  daysLeft: number;
  /** Dias que faltam (com hoje) em que a loja costuma vender. */
  openDaysLeft: number;
  realized: { income: number; margin: number; expense: number; profit: number };
  /** Ritmo dos dias que faltam (com o resto de hoje). */
  estimated: { income: number; margin: number; looseExpense: number };
  /** Contas a pagar até o fim do mês, inclusive atrasadas e recorrências. */
  bills: number;
  likely: { income: number; margin: number; profit: number };
  /** De onde veio o provável: o ritmo da loja ou, se maior, as OS prontas a receber. */
  basis: 'pace' | 'ready';
  /** Só o que já aconteceu, mais as OS prontas, menos as contas: sem vendas novas. */
  floor: { profit: number };
  previous: { month: string; income: number; margin: number; profit: number };
  /** Quanto falta faturar por dia de loja aberta para igualar o mês passado. */
  perOpenDayToMatchPrevious: number;
  /** Lucro de um dia típico de loja aberta (margem menos gastos avulsos), sem as contas. */
  perOpenDay: number;
  series: ForecastPoint[];
  /**
   * Lucro do mês se os dias que faltam seguirem as 2 semanas mais fracas ou as 2
   * mais fortes do histórico. Só com 4 semanas completas de movimento.
   */
  scenarios: { weeks: number; conservative: number; optimistic: number } | null;
  /** Dias de histórico usados no ritmo (até 56). */
  historyDays: number;
  confidence: Confidence;
};

const HISTORY_DAYS = 56;
const cents = (value: number) => Math.round(value * 100) / 100;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const addDays = (day: string, amount: number) => {
  const date = at(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return iso(date);
};
const weekday = (day: string) => at(day).getUTCDay();
const monthEnd = (day: string) => {
  const date = at(day);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return iso(date);
};
const monthStart = (day: string) => `${day.slice(0, 8)}01`;
const previousMonth = (day: string) => {
  const date = at(monthStart(day));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return iso(date);
};

/** Datas de um intervalo, inclusive as duas pontas. */
function range(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Vencimentos das contas pendentes até `end`, com as próximas ocorrências das recorrentes. */
function billDates(bills: PendingBill[], end: string) {
  const dates: { date: string; amount: number }[] = [];
  for (const bill of bills) {
    let due: string | null = bill.dueDate;
    // Cada conta conta até o fim do mês; atrasadas também (ainda vão sair do caixa).
    for (let guard = 0; due && due <= end && guard < 60; guard++) {
      dates.push({ date: due, amount: bill.amount });
      due = bill.recurrence ? nextPayableDueDate(due, bill.recurrence, bill.recurrenceDay) : null;
    }
  }
  return dates;
}

export function billsUntil(bills: PendingBill[], end: string) {
  return cents(billDates(bills, end).reduce((total, bill) => total + bill.amount, 0));
}

type Profile = { income: number; margin: number };

/**
 * Média de vendas de cada dia da semana na janela de histórico. Dia da semana
 * que ainda não apareceu (loja nova) usa a média geral por dia.
 */
function weekdayProfile(byDay: Map<string, DayTotals>, from: string, to: string) {
  const sums = Array.from({ length: 7 }, () => ({ income: 0, margin: 0, count: 0 }));
  const all = { income: 0, margin: 0, count: 0 };
  for (const day of from <= to ? range(from, to) : []) {
    const row = byDay.get(day);
    const slot = sums[weekday(day)];
    for (const target of [slot, all]) {
      target.count += 1;
      target.income += row?.income ?? 0;
      target.margin += (row?.income ?? 0) - (row?.cost ?? 0);
    }
  }
  const average = (sum: typeof all): Profile =>
    sum.count
      ? { income: sum.income / sum.count, margin: sum.margin / sum.count }
      : { income: 0, margin: 0 };
  return sums.map((slot) => average(slot.count ? slot : all));
}

export function forecastMonth(input: ForecastInput): MonthForecast {
  const today = input.asOfDate;
  const start = monthStart(today);
  const end = monthEnd(today);
  const byDay = new Map(input.days.map((row) => [row.day, row]));

  // Realizado: do dia 1 até agora.
  const realized = { income: 0, margin: 0, expense: 0, profit: 0 };
  for (const day of range(start, today)) {
    const row = byDay.get(day);
    if (!row) continue;
    realized.income += row.income;
    realized.margin += row.income - row.cost;
    realized.expense += row.looseExpense + row.billExpense;
  }
  realized.profit = realized.margin - realized.expense;

  // Ritmo: as 8 semanas antes de hoje, a partir do primeiro movimento da loja.
  const windowStart = addDays(today, -HISTORY_DAYS);
  const historyFrom =
    input.firstActivity && input.firstActivity > windowStart ? input.firstActivity : windowStart;
  const historyTo = addDays(today, -1);
  // Sem nenhum movimento ainda, não há ritmo para usar.
  const historyDays =
    input.firstActivity && historyFrom <= historyTo ? range(historyFrom, historyTo).length : 0;
  const profile = weekdayProfile(byDay, historyFrom, historyTo);
  const history = historyDays ? range(historyFrom, historyTo) : [];

  // Gastos avulsos de costume: média por dia, sem os dias atípicos (saídas
  // avulsas maiores que as vendas de um dia típico, como um equipamento ou um
  // empréstimo). Não seguem o dia da semana: um gasto num sábado não se repete
  // em todos os sábados.
  const sales = history.map((day) => byDay.get(day)?.income ?? 0).filter((value) => value > 0);
  const typicalSales = sales.reduce((sum, value) => sum + value, 0) / (sales.length || 1);
  const habitual = history.reduce((sum, day) => {
    const loose = byDay.get(day)?.looseExpense ?? 0;
    return loose > typicalSales ? sum : sum + loose;
  }, 0);
  const loosePerDay = history.length ? habitual / history.length : 0;

  // Hoje conta só o que ainda falta para chegar no dia típico.
  const typicalToday = profile[weekday(today)];
  const doneToday = byDay.get(today);
  const todayIncomeGap = Math.max(0, typicalToday.income - (doneToday?.income ?? 0));
  const todayRate = typicalToday.income > 0 ? typicalToday.margin / typicalToday.income : 0;
  const estimated = {
    income: todayIncomeGap,
    margin: todayIncomeGap * todayRate,
    looseExpense: Math.max(0, loosePerDay - (doneToday?.looseExpense ?? 0)),
  };
  const restOfToday = estimated.margin - estimated.looseExpense;
  const rest = today < end ? range(addDays(today, 1), end) : [];
  for (const day of rest) {
    const typical = profile[weekday(day)];
    estimated.income += typical.income;
    estimated.margin += typical.margin;
    estimated.looseExpense += loosePerDay;
  }

  const dueDates = billDates(input.pendingBills, end);
  const bills = billsUntil(input.pendingBills, end);
  const floorProfit = realized.profit + input.ready.margin - bills;
  const paceProfit = realized.profit + estimated.margin - estimated.looseExpense - bills;
  // As OS prontas já estão no ritmo; quando o ritmo é menor que elas, vale o piso.
  const likely = {
    income: Math.max(realized.income + estimated.income, realized.income + input.ready.income),
    margin: Math.max(realized.margin + estimated.margin, realized.margin + input.ready.margin),
    profit: Math.max(paceProfit, floorProfit),
  };

  const previousStart = previousMonth(today);
  const previous = { month: previousStart.slice(0, 7), income: 0, margin: 0, profit: 0 };
  for (const day of range(previousStart, monthEnd(previousStart))) {
    const row = byDay.get(day);
    if (!row) continue;
    previous.income += row.income;
    previous.margin += row.income - row.cost;
    previous.profit += row.income - row.cost - row.looseExpense - row.billExpense;
  }

  // Dias de loja aberta: os dias da semana em que a loja costuma vender.
  const remaining = [today, ...rest];
  const openDays = remaining.filter((day) => profile[weekday(day)].income > 0).length;
  const openDaysLeft = historyDays ? openDays : remaining.length;
  const missing = previous.income - realized.income;

  const open = profile.filter((slot) => slot.income > 0);
  const perOpenDay = open.length
    ? open.reduce((sum, slot) => sum + slot.margin, 0) / open.length - loosePerDay
    : 0;

  // Lucro acumulado dia a dia. A linha da projeção sai do ponto de hoje; o resto
  // de hoje e as contas atrasadas entram no dia seguinte (ou hoje, no último dia).
  const pace = paceProfit >= floorProfit;
  const dueOn = new Map<string, number>();
  for (const bill of dueDates) {
    const date = bill.date < today ? today : bill.date;
    dueOn.set(date, (dueOn.get(date) ?? 0) + bill.amount);
  }
  const series: ForecastPoint[] = [];
  let actual = 0;
  for (const day of range(start, today)) {
    const row = byDay.get(day);
    if (row) actual += row.income - row.cost - row.looseExpense - row.billExpense;
    series.push({ day, actual: cents(actual), projected: null });
  }
  let carry = (pace ? restOfToday : input.ready.margin) - (dueOn.get(today) ?? 0);
  let projected = realized.profit;
  if (!rest.length) projected += carry;
  series[series.length - 1].projected = cents(projected);
  for (const day of rest) {
    const typical = profile[weekday(day)];
    projected += carry - (dueOn.get(day) ?? 0);
    if (pace) projected += typical.margin - loosePerDay;
    carry = 0;
    series.push({ day, actual: null, projected: cents(projected) });
  }

  // Cenários: semanas completas até ontem, comparadas com a semana média.
  const weeks: number[] = [];
  for (let to = historyTo; historyDays && addDays(to, -6) >= historyFrom; to = addDays(to, -7)) {
    weeks.push(
      range(addDays(to, -6), to).reduce((sum, day) => {
        const row = byDay.get(day);
        return sum + (row ? row.income - row.cost : 0);
      }, 0),
    );
  }
  const averageWeek = weeks.reduce((sum, week) => sum + week, 0) / (weeks.length || 1);
  const sorted = [...weeks].sort((a, b) => a - b);
  const scenario = (pair: number[]) => {
    const ratio = (pair[0] + pair[1]) / 2 / averageWeek;
    return cents(
      Math.max(
        floorProfit,
        realized.profit + estimated.margin * ratio - estimated.looseExpense - bills,
      ),
    );
  };
  const scenarios =
    weeks.length >= 4 && averageWeek > 0
      ? {
          weeks: weeks.length,
          conservative: scenario(sorted.slice(0, 2)),
          optimistic: scenario(sorted.slice(-2)),
        }
      : null;

  return {
    month: today.slice(0, 7),
    daysLeft: rest.length,
    openDaysLeft,
    realized: {
      income: cents(realized.income),
      margin: cents(realized.margin),
      expense: cents(realized.expense),
      profit: cents(realized.profit),
    },
    estimated: {
      income: cents(estimated.income),
      margin: cents(estimated.margin),
      looseExpense: cents(estimated.looseExpense),
    },
    bills,
    likely: {
      income: cents(likely.income),
      margin: cents(likely.margin),
      profit: cents(likely.profit),
    },
    basis: pace ? 'pace' : 'ready',
    floor: { profit: cents(floorProfit) },
    previous: {
      month: previous.month,
      income: cents(previous.income),
      margin: cents(previous.margin),
      profit: cents(previous.profit),
    },
    perOpenDayToMatchPrevious: missing > 0 && openDaysLeft > 0 ? cents(missing / openDaysLeft) : 0,
    perOpenDay: cents(perOpenDay),
    series,
    scenarios,
    historyDays,
    confidence: historyDays === 0 ? 'none' : historyDays < 21 ? 'low' : 'ok',
  };
}
