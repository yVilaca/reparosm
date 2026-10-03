import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { todayInSaoPaulo } from '../lib/warranty.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, dashboard;
const A = 'account-dash';
const today = todayInSaoPaulo();

const order = (
  id,
  code,
  { stage, status = 'Aberto', total = 0, priority = 'Normal', days = 0, phone = '11987650000' },
) =>
  db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, phone, device, stage, status, total, priority,
                         created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'iPhone 13', $6, $7, $8, $9,
             now() - make_interval(days => $10::int), now() - make_interval(days => $10::int))`,
    [id, A, code, `Cliente ${code}`, phone, stage, status, total, priority, days],
  );

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-dash', 'dash', 'Dash', 'merchant', 'active', 'x'),
            ('account-other', 'other', 'Other', 'merchant', 'active', 'x')`,
  );
  await order('o-ready', 'OS-1', { stage: 'Retirada', total: 280, days: 1 });
  await order('o-charge', 'OS-2', { stage: 'Retirada', status: 'Concluído', total: 520, days: 2 });
  await order('o-paid', 'OS-3', { stage: 'Retirada', status: 'Concluído', total: 180, days: 3 });
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ('p-paid', $1, 'in', 'OS', 180, 'o-paid')`,
    [A],
  );
  await order('o-cancel', 'OS-4', { stage: 'Em reparo', status: 'Cancelado', total: 300, days: 5 });
  await order('o-urgent-old', 'OS-5', {
    stage: 'Em reparo',
    priority: 'Urgente',
    total: 650,
    days: 3,
  });
  await order('o-urgent-new', 'OS-6', {
    stage: 'Em reparo',
    priority: 'Urgente',
    total: 400,
    days: 0,
  });
  await order('o-diag', 'OS-7', { stage: 'Diagnóstico' });
  await db.migrationQuery(
    `INSERT INTO quotes (id, account_id, code, customer, phone, device, service, total, status, created_at)
     VALUES ('q-old', $1, 'ORC-1', 'Gustavo', '11976543210', 'iPhone 15', 'Tela', 1400, 'Aguardando', now() - interval '3 days'),
            ('q-new', $1, 'ORC-2', 'Patrícia', '11965432109', 'Z Flip', 'Tela', 1850, 'Aguardando', now() - interval '1 day'),
            ('q-done', $1, 'ORC-3', 'Diego', '11954321098', 'Moto', 'Tela', 250, 'Aprovado', now() - interval '6 days')`,
    [A],
  );
  await db.migrationQuery(
    `INSERT INTO payables (id, account_id, description, supplier, amount, due_date, status)
     VALUES ('b-late', $1, 'Conta de energia', 'Enel', 412.35, $2::date - 2, 'pending'),
            ('b-future', $1, 'Lote de telas', 'Distribuidora', 2380, $2::date + 5, 'pending')`,
    [A, today],
  );
  // Conta paga de verdade: com data, valor e a saída no caixa.
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date)
     VALUES ('cash-payable-b-paid', $1, 'out', 'Internet', 120, 'Pix', $2::date - 13)`,
    [A, today],
  );
  await db.migrationQuery(
    `INSERT INTO payables (id, account_id, description, supplier, amount, due_date, status,
                           paid_at, paid_on, paid_amount, method, cash_entry_id)
     VALUES ('b-paid', $1, 'Internet', 'Vivo', 120, $2::date - 13, 'paid',
             now(), $2::date - 13, 120, 'Pix', 'cash-payable-b-paid')`,
    [A, today],
  );
  await db.migrationQuery(
    `INSERT INTO parts (id, account_id, name, stock, price) VALUES
       ('pt-zero', $1, 'Bateria Moto G84', 0, 130), ('pt-ok', $1, 'Película 3D', 40, 60)`,
    [A],
  );
  // Outra loja: nada disso pode aparecer.
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, stage, status, total)
     VALUES ('o-foreign', 'account-other', 'OS-1', 'Intruso', 'Moto', 'Retirada', 'Aberto', 999)`,
  );
  dashboard = await import('../lib/repos/dashboard.ts');
});
after(async () => db?.drop());

const kindsById = (actions) => Object.fromEntries(actions.map((item) => [item.id, item.kind]));

test('lists only the things that need someone to act', { skip }, async () => {
  const actions = await dashboard.actions(A, today);
  assert.deepEqual(kindsById(actions), {
    'o-ready': 'ready',
    'o-charge': 'charge',
    'o-urgent-old': 'stalled',
    'q-old': 'quote',
    'b-late': 'overdue',
    'pt-zero': 'restock',
  });
});

test('carries who, what, how much and how long', { skip }, async () => {
  const actions = await dashboard.actions(A, today);
  const charge = actions.find((item) => item.id === 'o-charge');
  assert.equal(charge.code, 'OS-2');
  assert.equal(charge.who, 'Cliente OS-2');
  assert.equal(charge.what, 'iPhone 13');
  assert.equal(charge.amount, 520);
  assert.equal(charge.days, 2);
  const bill = actions.find((item) => item.id === 'b-late');
  assert.equal(bill.who, 'Enel');
  assert.equal(bill.amount, 412.35);
  assert.equal(bill.days, 2);
});

test('puts the longest wait first and restocking last', { skip }, async () => {
  const actions = await dashboard.actions(A, today);
  const days = actions.slice(0, -1).map((item) => item.days);
  assert.deepEqual(
    days,
    [...days].sort((a, b) => b - a),
  );
  assert.equal(actions.at(-1).kind, 'restock');
});

test('counts the bench by stage, only for orders still in service', { skip }, async () => {
  const bench = await dashboard.bench(A);
  assert.deepEqual(bench, [
    { stage: 'Recebido', orders: 0 },
    { stage: 'Diagnóstico', orders: 1 },
    { stage: 'Aguardando aprovação', orders: 0 },
    { stage: 'Em reparo', orders: 2 },
    { stage: 'Teste final', orders: 0 },
    { stage: 'Retirada', orders: 1 },
  ]);
});
