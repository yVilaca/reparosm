import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  groupAgenda,
  groupHistory,
  matchesOrder,
  receivableGroup,
  receivableLabel,
  summarizeAgenda,
} from '../lib/agenda.ts';

const today = '2026-10-03';

const order = (id, total, extra = {}) => ({
  id,
  code: `OS-${id}`,
  customer: `Cliente ${id}`,
  device: 'iPhone 13',
  total,
  stage: 'Em reparo',
  status: 'Aberto',
  days: 0,
  ...extra,
});
const bill = (id, amount, dueDate, extra = {}) => ({
  id,
  description: `Conta ${id}`,
  amount,
  dueDate,
  status: 'pending',
  ...extra,
});
const charge = (id, total, days) =>
  order(id, total, { status: 'Concluído', stage: 'Retirada', days });
const pickup = (id, total, days) => order(id, total, { stage: 'Retirada', days });

test('a concluded unpaid order is late after a day; ready for pickup is for today', () => {
  assert.equal(receivableGroup(charge('a', 100, 2)), 'overdue');
  assert.equal(receivableGroup(charge('b', 100, 0)), 'today');
  assert.equal(
    receivableGroup(order('c', 100, { status: 'Aguardando pagamento', days: 1 })),
    'overdue',
  );
  assert.equal(receivableGroup(pickup('d', 100, 9)), 'today');
  assert.equal(receivableGroup(order('e', 100, { stage: 'Diagnóstico' })), 'repair');
});

test('says in plain words why the order is waiting', () => {
  assert.equal(receivableLabel(charge('a', 1, 0)), 'Concluída hoje, sem pagamento');
  assert.equal(receivableLabel(charge('a', 1, 1)), 'Concluída há 1 dia, sem pagamento');
  assert.equal(receivableLabel(charge('a', 1, 4)), 'Concluída há 4 dias, sem pagamento');
  assert.equal(receivableLabel(pickup('b', 1, 0)), 'Pronta para retirada hoje');
  assert.equal(receivableLabel(pickup('b', 1, 3)), 'Pronta para retirada há 3 dias');
  assert.equal(
    receivableLabel(order('c', 1, { stage: 'Aguardando aprovação' })),
    'Aguardando aprovação',
  );
});

test('mixes both directions in the same urgency groups, with a total for each side', () => {
  const groups = groupAgenda(
    [charge('late-os', 520, 2), pickup('ready-os', 280, 1), order('bench-os', 650, { days: 3 })],
    [
      bill('late-bill', 412.35, '2026-09-30'),
      bill('today-bill', 129.9, today),
      bill('week-bill', 2200, '2026-10-08'),
      bill('later-bill', 350, '2026-10-20'),
      bill('undated-bill', 180, undefined),
      bill('paid-bill', 99, '2026-09-01', { status: 'paid' }),
    ],
    today,
  );
  assert.deepEqual(
    groups.map((group) => [
      group.group,
      group.receive,
      group.pay,
      group.items.map((item) => `${item.kind}:${item.id}`),
    ]),
    [
      ['overdue', 520, 412.35, ['pay:late-bill', 'receive:late-os']],
      ['today', 280, 129.9, ['receive:ready-os', 'pay:today-bill']],
      ['week', 0, 2200, ['pay:week-bill']],
      ['later', 0, 350, ['pay:later-bill']],
      ['repair', 650, 0, ['receive:bench-os']],
      ['undated', 0, 180, ['pay:undated-bill']],
    ],
  );
});

test('sums what can be collected now and what must be paid within 7 days', () => {
  const summary = summarizeAgenda(
    [charge('a', 520, 2), pickup('b', 280, 1), order('c', 650), order('d', 100)],
    [
      bill('x', 412.35, '2026-09-30'),
      bill('y', 129.9, today),
      bill('z', 2200, '2026-10-10'),
      bill('w', 350, '2026-10-11'),
      bill('v', 180, undefined),
      bill('paid', 1, today, { status: 'paid' }),
    ],
    today,
  );
  assert.deepEqual(summary, {
    receive: { now: { amount: 800, count: 2 }, repair: { amount: 750, count: 2 } },
    pay: {
      week: { amount: 2742.25, count: 3 },
      overdue: { amount: 412.35, count: 1 },
      later: { amount: 530, count: 2 },
      until: '2026-10-10',
    },
  });
});

test('finds an order by customer, code or device, ignoring accents', () => {
  const found = order('7', 1, { customer: 'Patrícia Gomes', device: 'Galaxy Z Flip' });
  assert.equal(matchesOrder(found, 'patricia'), true);
  assert.equal(matchesOrder(found, 'os-7'), true);
  assert.equal(matchesOrder(found, 'flip'), true);
  assert.equal(matchesOrder(found, 'iphone'), false);
  assert.equal(matchesOrder(found, ' '), true);
});

test('groups receipts and paid bills by month, newest first, with both totals', () => {
  const months = groupHistory(
    [
      {
        id: 'r1',
        orderId: 'o1',
        code: 'OS-1',
        customer: 'Ana',
        device: 'Moto',
        value: 300,
        date: '2026-10-02',
      },
      {
        id: 'r2',
        orderId: 'o2',
        code: 'OS-2',
        customer: 'Bia',
        device: 'iPhone',
        value: 150.5,
        date: '2026-09-15',
      },
    ],
    [
      bill('p1', 92.1, '2026-09-28', { status: 'paid', paidOn: '2026-10-01', paidAmount: 96.4 }),
      bill('p2', 2200, '2026-09-08', { status: 'paid', paidOn: '2026-09-08' }),
      bill('open', 10, '2026-10-01'),
    ],
  );
  assert.deepEqual(
    months.map((month) => [
      month.month,
      month.label,
      month.receive,
      month.pay,
      month.items.map((item) => `${item.kind}:${item.id}`),
    ]),
    [
      ['2026-10', 'Outubro de 2026', 300, 96.4, ['receive:r1', 'pay:p1']],
      ['2026-09', 'Setembro de 2026', 150.5, 2200, ['receive:r2', 'pay:p2']],
    ],
  );
});
