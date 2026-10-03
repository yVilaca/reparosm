import { daysUntil, dueGroup, monthLabel, plainText } from '@/lib/payable-schedule';

/** OS com valor e sem recebimento. `days`: desde a última atualização, em dias de São Paulo. */
export type ReceivableOrder = {
  id: string;
  code: string;
  customer: string;
  device: string;
  phone?: string;
  total: number;
  stage: string;
  status: string;
  days: number;
};

/** Recebimento de uma OS, lançado no caixa. */
export type Receipt = {
  id: string;
  orderId: string;
  code: string;
  customer: string;
  device: string;
  value: number;
  method?: string;
  date: string;
};

type Bill = {
  id: string;
  amount: number;
  dueDate?: string;
  status?: 'pending' | 'paid';
  paidOn?: string;
  paidAmount?: number;
};

export type AgendaGroup = 'overdue' | 'today' | 'week' | 'later' | 'repair' | 'undated';
export type ReceivableState = 'charge' | 'pickup' | 'repair';

export type AgendaItem<B extends Bill = Bill> =
  { kind: 'receive'; id: string; order: ReceivableOrder } | { kind: 'pay'; id: string; bill: B };

type Total = { amount: number; count: number };

const cents = (values: number[]) =>
  values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
const totalOf = (values: number[]): Total => ({ amount: cents(values), count: values.length });
const isOpen = (bill: Bill) => bill.status !== 'paid';
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Concluída e não paga: cobrar. Pronta na bancada: receber na retirada. O resto ainda está no conserto. */
export function receivableState(order: ReceivableOrder): ReceivableState {
  if (order.status === 'Concluído' || order.status === 'Aguardando pagamento') return 'charge';
  return order.stage === 'Retirada' ? 'pickup' : 'repair';
}

export function receivableGroup(order: ReceivableOrder): AgendaGroup {
  const state = receivableState(order);
  if (state === 'charge') return order.days >= 1 ? 'overdue' : 'today';
  return state === 'pickup' ? 'today' : 'repair';
}

export function receivableLabel(order: ReceivableOrder) {
  const ago = `há ${order.days} ${plural(order.days, 'dia', 'dias')}`;
  switch (receivableState(order)) {
    case 'charge':
      return `Concluída ${order.days ? ago : 'hoje'}, sem pagamento`;
    case 'pickup':
      return `Pronta para retirada ${order.days ? ago : 'hoje'}`;
    default:
      return order.stage;
  }
}

const groupOrder: AgendaGroup[] = ['overdue', 'today', 'week', 'later', 'repair', 'undated'];

/** Dias de atraso de um item: ordena do mais atrasado para o mais recente. */
const lateness = (item: AgendaItem, today: string) =>
  item.kind === 'receive'
    ? item.order.days
    : item.bill.dueDate
      ? daysUntil(item.bill.dueDate, today)
      : 0;
const amountOf = (item: AgendaItem) =>
  item.kind === 'receive' ? item.order.total : item.bill.amount;

/** Pendências dos dois lados nos mesmos grupos de prazo, com quanto entra e sai em cada um. */
export function groupAgenda<B extends Bill>(orders: ReceivableOrder[], bills: B[], today: string) {
  const items: (AgendaItem<B> & { group: AgendaGroup })[] = [
    ...orders.map((order) => ({
      kind: 'receive' as const,
      id: order.id,
      order,
      group: receivableGroup(order),
    })),
    ...bills.filter(isOpen).map((bill) => ({
      kind: 'pay' as const,
      id: bill.id,
      bill,
      group: dueGroup(bill.dueDate, today) as AgendaGroup,
    })),
  ];
  return groupOrder
    .map((group) => {
      const members = items
        .filter((item) => item.group === group)
        .sort((left, right) =>
          group === 'week' || group === 'later'
            ? (left.kind === 'pay' ? left.bill.dueDate || '' : '').localeCompare(
                right.kind === 'pay' ? right.bill.dueDate || '' : '',
              )
            : lateness(right, today) - lateness(left, today) || amountOf(right) - amountOf(left),
        );
      return {
        group,
        receive: cents(members.filter((item) => item.kind === 'receive').map(amountOf)),
        pay: cents(members.filter((item) => item.kind === 'pay').map(amountOf)),
        items: members as AgendaItem<B>[],
      };
    })
    .filter((group) => group.items.length > 0);
}

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Os dois cartões do topo: o que dá para receber agora e o que vence até daqui a 7 dias. */
export function summarizeAgenda(orders: ReceivableOrder[], bills: Bill[], today: string) {
  const now = orders.filter((order) => receivableGroup(order) !== 'repair');
  const repair = orders.filter((order) => receivableGroup(order) === 'repair');
  const open = bills.filter(isOpen);
  const soon = open.filter((bill) =>
    ['overdue', 'today', 'week'].includes(dueGroup(bill.dueDate, today)),
  );
  const overdue = open.filter((bill) => dueGroup(bill.dueDate, today) === 'overdue');
  const later = open.filter((bill) => !soon.includes(bill));
  const amounts = (rows: Bill[]) => rows.map((bill) => bill.amount);
  return {
    receive: {
      now: totalOf(now.map((order) => order.total)),
      repair: totalOf(repair.map((order) => order.total)),
    },
    pay: {
      week: totalOf(amounts(soon)),
      overdue: totalOf(amounts(overdue)),
      later: totalOf(amounts(later)),
      until: addDays(today, 7),
    },
  };
}

export function matchesOrder(
  order: Pick<ReceivableOrder, 'customer' | 'code' | 'device'>,
  query: string,
) {
  const wanted = plainText(query.trim());
  if (!wanted) return true;
  return [order.customer, order.code, order.device].some((text) =>
    plainText(text).includes(wanted),
  );
}

/** Recebimentos e contas pagas por mês, do mais recente para o mais antigo. */
export function groupHistory<B extends Bill>(receipts: Receipt[], bills: B[]) {
  const items = [
    ...receipts.map((receipt) => ({
      kind: 'receive' as const,
      id: receipt.id,
      receipt,
      date: receipt.date,
      value: receipt.value,
    })),
    ...bills
      .filter((bill) => !isOpen(bill))
      .map((bill) => ({
        kind: 'pay' as const,
        id: bill.id,
        bill,
        date: bill.paidOn || '',
        value: bill.paidAmount ?? bill.amount,
      })),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const months = [...new Set(items.map((item) => item.date.slice(0, 7)))];
  return months.map((month) => {
    const members = items.filter((item) => item.date.slice(0, 7) === month);
    const sum = (kind: 'receive' | 'pay') =>
      cents(members.filter((item) => item.kind === kind).map((item) => item.value));
    return {
      month,
      label: month ? monthLabel(month) : 'Sem data',
      receive: sum('receive'),
      pay: sum('pay'),
      items: members,
    };
  });
}
