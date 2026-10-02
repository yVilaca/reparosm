import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;

const entry = (id, kind, value, date, method = 'Pix') =>
  db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date)
     VALUES ($1, 'account-cash', $2, 'Lançamento', $3, $4, $5)`,
    [id, kind, value, method, date],
  );

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-cash', 'cash', 'Cash', 'merchant', 'active', 'x')`,
  );
  await entry('cash-1', 'in', 420, '2026-03-31', 'Pix');
  await entry('cash-2', 'in', 300, '2026-03-31', 'Cartão de débito');
  await entry('cash-3', 'out', 120, '2026-03-31', 'Dinheiro');
  await entry('cash-4', 'in', 100, '2026-03-05', 'Pix');
  await entry('cash-5', 'in', 900, '2026-02-10', 'Pix');
  await entry('cash-6', 'in', 50, '2026-03-30', '   ');
  // Lançamento sem data: a competência cai no created_at convertido para SP.
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, created_at)
     VALUES ('cash-7', 'account-cash', 'in', 'Sem data', 70, 'Pix', NULL,
             TIMESTAMPTZ '2026-03-31 21:30:00-03')`,
  );
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

test('closes the day with totals and a breakdown by method', { skip }, async () => {
  const result = await cash.today('account-cash', '2026-03-31');
  assert.equal(result.income, 790); // 420 + 300 + 70
  assert.equal(result.expense, 120);
  assert.equal(result.balance, 670);
  const pix = result.methods.find((item) => item.method === 'Pix');
  assert.equal(pix.value, 490); // 420 + 70
});

// Review Focus: 21h30 em São Paulo ainda é o mesmo dia; em UTC já é o dia
// seguinte.
test('counts a 21:30 entry on the São Paulo day', { skip }, async () => {
  const result = await cash.today('account-cash', '2026-04-01');
  assert.equal(result.income, 0);
});

// Review Focus: method em branco não pode virar um balde invisível.
test('groups blank methods as "Não informado"', { skip }, async () => {
  const result = await cash.today('account-cash', '2026-03-30');
  assert.deepEqual(result.methods, [{ method: 'Não informado', value: 50 }]);
});

test('compares the month against the same elapsed days', { skip }, async () => {
  const result = await cash.month('account-cash', '2026-03-31');
  assert.equal(result.current.income, 940); // 420 + 300 + 100 + 50 + 70
  // Fevereiro de 2026 tem 28 dias: a janela anterior para em 28/02 e não
  // invade março.
  assert.equal(result.previous.income, 900);
});

// Review Focus: virada de ano.
test('uses December of the previous year in January', { skip }, async () => {
  await entry('cash-8', 'in', 25, '2025-12-02');
  const result = await cash.month('account-cash', '2026-01-03');
  assert.equal(result.previous.income, 25);
});
