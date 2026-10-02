# Financeiro ligado à OS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o dinheiro de uma OS nascer da própria OS e dar à aba
Financeiro três números concretos (hoje, mês contra mesmo período anterior, a
receber), substituindo somas de toda a história feitas no navegador.

**Architecture:** `cash_entries` ganha `order_id` com FK composta por conta,
CHECK restringindo o vínculo a entradas e índice único parcial que torna
"uma OS tem no máximo um recebimento" uma garantia do banco. O estado "paga"
não é coluna: é derivado de `LEFT JOIN`. A regra de quando cobrar mora no
servidor (`lib/orders.ts`) e as telas só obedecem abrindo um diálogo
compartilhado. As leituras saem de um módulo novo de agregação SQL
(`lib/repos/cash.ts`) com data de referência injetável.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, TypeScript strict,
PostgreSQL, pnpm, `node:test` com banco descartável por arquivo de teste.

**Spec:** `docs/superpowers/specs/2026-10-01-financeiro-ligado-a-os-design.md`

## Global Constraints

- Fuso do produto é `America/Sao_Paulo`; use `todayInSaoPaulo()` de
  `lib/warranty.ts`. Nunca `new Date().toISOString().slice(0, 10)`.
- `now()` e `CURRENT_DATE` **não aparecem** em consulta de período: o "hoje"
  chega como parâmetro `asOfDate`.
- Nenhuma coluna de pagamento em `orders`. O estado "paga" é sempre derivado.
- `order_id` **não** entra em `cashColumns` (`lib/repos/rest.ts`). A proteção
  do vínculo é por omissão.
- O servidor ignora qualquer valor de cobrança enviado pelo cliente e grava
  `orders.total`.
- `orders.status` não é alterado por pagamento.
- Toda saída de dinheiro (`kind = 'out'`) tem `order_id` nulo.
- Após cada task: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`.
- `pnpm test` exige `DATABASE_URL` apontando para um Postgres onde o usuário
  possa criar bancos e a role `reparosm_runtime` (`CREATEDB` e `CREATEROLE`).
  Sem a variável, os testes de banco são silenciosamente ignorados — o que
  faria metade deste plano parecer verde sem ter rodado.

## Review Focus

- **`LEFT JOIN` com a condição no `WHERE` em vez de no `ON`** — transformaria
  o join em `INNER` e sumiria com toda OS não paga da listagem de `/ordens` e
  da Mesa. Task 2 testa que uma OS sem recebimento continua aparecendo.
- **Lançamento com `date` nulo** — sem o `COALESCE` de competência ele some
  de todos os períodos e continua somando no total geral. Task 6 testa.
- **Divergência comparada em float no JavaScript** — `value` e `total` são
  `numeric(12,2)`; comparar depois de converter para `Number` erra em
  centavos. A comparação fica no SQL. Task 7 testa com 0,01 de diferença.
- **Virada de ano no "mês passado"** — em 1º de janeiro a janela anterior é
  dezembro do ano anterior. Task 6 testa com `asOfDate` em janeiro.
- **`method` só com espaços** — escaparia do balde "Não informado" e criaria
  uma forma de pagamento invisível no fechamento. Task 6 testa com `'   '`.
- **Histórico fora do período atual** — o seletor precisa chamar uma rota que
  use `cash.history` no servidor; reaproveitar `/api/payments` e
  `/api/expenses` voltaria a carregar a história inteira. Task 8 testa a rota
  e Task 9 testa a troca do período na tela.

---

## Bloco 1 — Banco e escrita

### Task 1: Migração do vínculo entre lançamento e OS

**Files:**

- Create: `netlify/database/migrations/0015_cash_entry_order_link.sql`
- Test: `tests/cash-entry-link.test.mjs`

**Interfaces:**

- Consumes: nada.
- Produces: coluna `cash_entries.order_id` com três invariantes de banco
  (FK composta por conta, CHECK `kind = 'in' OR order_id IS NULL`, índice
  único parcial `cash_entries_order_income_idx`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/cash-entry-link.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-link-a', 'link-a', 'Link A', 'merchant', 'active', 'x'),
            ('account-link-b', 'link-b', 'Link B', 'merchant', 'active', 'x')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-link-1', 'account-link-a', 'OS-1', 'Ana', 'iPhone', 350),
            ('order-link-2', 'account-link-b', 'OS-1', 'Bruno', 'Moto', 200)`,
  );
});
after(async () => db?.drop());

const entry = (id, accountId, kind, orderId, value = 350) =>
  db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ($1, $2, $3, 'Recebimento', $4, $5)`,
    [id, accountId, kind, value, orderId],
  );

test('links an income entry to an order of the same account', { skip }, async () => {
  await entry('payment-link-1', 'account-link-a', 'in', 'order-link-1');
  const rows = await db.migrationQuery(
    `SELECT order_id FROM cash_entries WHERE id = 'payment-link-1'`,
  );
  assert.equal(rows[0].order_id, 'order-link-1');
});

test('rejects an expense linked to an order', { skip }, async () => {
  await assert.rejects(() => entry('expense-link-1', 'account-link-a', 'out', 'order-link-1'));
});

test('rejects a link to an order from another account', { skip }, async () => {
  await assert.rejects(() => entry('payment-link-2', 'account-link-b', 'in', 'order-link-1'));
});

test('rejects a second income for the same order', { skip }, async () => {
  await assert.rejects(() => entry('payment-link-3', 'account-link-a', 'in', 'order-link-1'));
});

test('keeps the entry and clears the link when the order is deleted', { skip }, async () => {
  await db.migrationQuery(`DELETE FROM orders WHERE id = 'order-link-1'`);
  const rows = await db.migrationQuery(
    `SELECT order_id FROM cash_entries WHERE id = 'payment-link-1'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].order_id, null);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="links an income entry"`
Expected: FAIL — a coluna `order_id` não existe.

- [ ] **Step 3: Escrever a migração**

Crie `netlify/database/migrations/0015_cash_entry_order_link.sql`:

```sql
-- O caixa passa a saber de qual OS veio cada recebimento. Segue o padrão
-- multi-tenant da 0010: FK composta, para que lançamento e OS não possam
-- pertencer a contas diferentes.
ALTER TABLE cash_entries ADD COLUMN order_id text;

ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_account_order_fkey
  FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id)
  ON DELETE SET NULL (order_id);

-- Despesa nunca pertence a uma OS.
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_order_income_only
  CHECK (kind = 'in' OR order_id IS NULL);

-- O pagamento acontece inteiro na retirada: uma OS tem no máximo um
-- recebimento. Garantia do banco, não do código — é o que resolve duas
-- confirmações simultâneas. Dispensa índice comum: o CHECK acima garante
-- que toda linha com order_id preenchido tem kind = 'in'.
CREATE UNIQUE INDEX cash_entries_order_income_idx
  ON cash_entries (account_id, order_id) WHERE kind = 'in' AND order_id IS NOT NULL;
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="link"`
Expected: PASS nos cinco testes.

- [ ] **Step 5: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add netlify/database/migrations/0015_cash_entry_order_link.sql tests/cash-entry-link.test.mjs
git commit -m "feat: link cash entries to the order that generated them"
```

---

### Task 2: Resumo `payment` nas leituras de OS

**Files:**

- Modify: `lib/repos/orders.ts:43-47` (o `select`), `:13-41` (`OrderRow`),
  `:49-85` (`toOrder`)
- Modify: `lib/types.ts` (interface `Order`)
- Test: `tests/order-payment-summary.test.mjs`

**Interfaces:**

- Consumes: a coluna `cash_entries.order_id` da Task 1.
- Produces: `Order.payment?: OrderPayment | null`, com
  `type OrderPayment = { id: string; value: number; method: string; date: string }`
  exportado de `lib/types.ts`. Tasks 4, 5, 9 e 10 consomem esse resumo.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/order-payment-summary.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, orders;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-pay', 'pay', 'Pay', 'merchant', 'active', 'x')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, stage)
     VALUES ('order-paid', 'account-pay', 'OS-1', 'Ana', 'iPhone', 350, 'Retirada'),
            ('order-unpaid', 'account-pay', 'OS-2', 'Bruno', 'Moto', 200, 'Em reparo')`,
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
     VALUES ('payment-1', 'account-pay', 'in', 'OS-1', 350, 'Pix', DATE '2026-03-10', 'order-paid')`,
  );
  orders = await import('../lib/repos/orders.ts');
});
after(async () => db?.drop());

test('exposes the linked payment as a read-only summary', { skip }, async () => {
  const record = await orders.get('account-pay', 'order-paid');
  assert.deepEqual(record.data.payment, {
    id: 'payment-1',
    value: 350,
    method: 'Pix',
    date: '2026-03-10',
  });
});

test('reports no payment for an unpaid order', { skip }, async () => {
  const record = await orders.get('account-pay', 'order-unpaid');
  assert.equal(record.data.payment, null);
});

// Review Focus: a condição kind = 'in' precisa estar no ON, não no WHERE —
// no WHERE o LEFT JOIN vira INNER e some com toda OS não paga da listagem.
test('keeps unpaid orders in the list', { skip }, async () => {
  const ids = (await orders.list('account-pay')).map((record) => record.id);
  assert.deepEqual(ids.sort(), ['order-paid', 'order-unpaid']);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="read-only summary"`
Expected: FAIL — `record.data.payment` é `undefined`.

- [ ] **Step 3: Declarar o tipo**

Em `lib/types.ts`, antes de `export interface Order`:

```ts
export type OrderPayment = { id: string; value: number; method: string; date: string };
```

E dentro de `export interface Order`, junto dos demais campos opcionais:

```ts
  payment?: OrderPayment | null;
```

- [ ] **Step 4: Estender a consulta**

Em `lib/repos/orders.ts`, acrescente ao tipo `OrderRow` (depois de
`client_id`):

```ts
payment_id: string | null;
payment_value: string | null;
payment_method: string | null;
payment_date: string | null;
```

Troque a constante `select` (linhas 43-47) por:

```ts
const select = `SELECT o.id, o.code, o.customer, o.phone, o.device, o.imei, o.device_password,
    o.pattern, o.problem, o.service, o.notes, o.technician, o.priority, o.stage, o.status,
    o.labor, o.parts, o.cost, o.total, o.warranty_days, o.delivered_at, o.whatsapp_consent, o.quote_id,
    q.code AS quote_code, o.client_id, o.created_at, o.updated_at,
    c.id AS payment_id, c.value AS payment_value, c.method AS payment_method,
    c.date::text AS payment_date
  FROM orders o
  LEFT JOIN quotes q ON q.id = o.quote_id
  LEFT JOIN cash_entries c
    ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'`;
```

A condição `c.kind = 'in'` fica no `ON`. No `WHERE` o join viraria `INNER` e
sumiria com toda OS não paga.

- [ ] **Step 5: Montar o resumo**

Em `toOrder`, dentro de `compact({ ... })`, acrescente depois de `clientId`:

```ts
      payment: row.payment_id
        ? {
            id: row.payment_id,
            value: money(row.payment_value),
            method: row.payment_method || '',
            date: row.payment_date || '',
          }
        : null,
```

- [ ] **Step 6: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="payment"`
Expected: PASS nos três testes.

- [ ] **Step 7: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add lib/repos/orders.ts lib/types.ts tests/order-payment-summary.test.mjs
git commit -m "feat: derive order payment state from the linked cash entry"
```

---

### Task 3: Etapa normalizada e sinal de cobrança

**Files:**

- Modify: `lib/orders.ts:40-81`
- Test: `tests/order-payment-trigger.test.mjs`

**Interfaces:**

- Consumes: `Order.payment` da Task 2.
- Produces: `saveOrder()` devolve `{ record, client, notification, paymentDue }`,
  onde `paymentDue: { orderId: string; total: number } | null`. Tasks 5 e 10
  consomem.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/order-payment-trigger.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, saveOrder;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-trigger', 'trigger', 'Trigger', 'merchant', 'active', 'x')`,
  );
  ({ saveOrder } = await import('../lib/orders.ts'));
});
after(async () => db?.drop());

const base = { customer: 'Ana', device: 'iPhone', labor: 350, parts: 0, total: 350 };
const save = (id, data) => saveOrder('account-trigger', id, { ...base, ...data });

test('asks for payment when the order enters Retirada', { skip }, async () => {
  await save('order-t1', { stage: 'Em reparo' });
  const result = await save('order-t1', { stage: 'Retirada' });
  assert.deepEqual(result.paymentDue, { orderId: 'order-t1', total: 350 });
});

test('asks for payment when a new API order starts in Retirada', { skip }, async () => {
  const result = await save('order-t-direct', { stage: 'Retirada' });
  assert.deepEqual(result.paymentDue, { orderId: 'order-t-direct', total: 350 });
});

test('does not ask again while it stays in Retirada', { skip }, async () => {
  const result = await save('order-t1', { stage: 'Retirada' });
  assert.equal(result.paymentDue, null);
});

test('does not ask when the total is zero', { skip }, async () => {
  await save('order-t2', { stage: 'Em reparo', labor: 0, total: 0 });
  const result = await save('order-t2', { stage: 'Retirada', labor: 0, total: 0 });
  assert.equal(result.paymentDue, null);
});

test('does not ask when a payment is already linked', { skip }, async () => {
  await save('order-t3', { stage: 'Em reparo' });
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ('payment-t3', 'account-trigger', 'in', 'OS', 350, 'order-t3')`,
  );
  const result = await save('order-t3', { stage: 'Retirada' });
  assert.equal(result.paymentDue, null);
});

// Regressão: a comparação usava a etapa crua do cliente, então salvar sem o
// campo disparava transição onde não houve nenhuma.
test('treats a missing stage as no transition', { skip }, async () => {
  await save('order-t4', { stage: 'Recebido' });
  const result = await save('order-t4', { stage: undefined });
  assert.equal(result.paymentDue, null);
  assert.equal(result.notification, null);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="enters Retirada"`
Expected: FAIL — `result.paymentDue` é `undefined`.

- [ ] **Step 3: Corrigir a comparação e emitir o sinal**

Em `lib/orders.ts`, dentro de `saveOrder`, depois de
`const record = await orders.save(accountId, id, savedOrder, run);` e antes do
`return` da transação, o bloco já calcula `stage`. Troque o `return` interno
(linha 59) por:

```ts
return {
  previous,
  record,
  client: await clients.get(accountId, clientId, run),
  previousStage: previous?.data.stage,
  nextStage: stage,
};
```

Depois da transação, troque o bloco de notificação (linhas 63-78) por:

```ts
// A etapa comparada é a normalizada dos dois lados. Comparar com a etapa
// crua do cliente fazia uma OS salva sem o campo parecer ter mudado.
const movedStage = result.previousStage !== result.nextStage;
let notification: unknown = null;
if (!result.previous || movedStage) {
  try {
    notification = await notifyOrder(
      accountId,
      id,
      result.record.data,
      result.previous ? 'status' : 'created',
    );
  } catch {
    notification = {
      status: 'failed',
      reason: 'OS salva, mas não foi possível registrar a notificação.',
    };
  }
}
```

E troque o `return` final (linhas 79-80) por:

```ts
const record = (await orders.get(accountId, id)) ?? result.record;
const enteredPickup = result.nextStage === 'Retirada' && result.previousStage !== 'Retirada';
const total = Number(record.data.total || 0);
const paymentDue =
  enteredPickup && total > 0 && !record.data.payment ? { orderId: id, total } : null;
return { record, client: result.client, notification, paymentDue };
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="payment|transition"`
Expected: PASS nos seis testes, e a suíte existente de ordens sem regressão.

- [ ] **Step 5: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add lib/orders.ts tests/order-payment-trigger.test.mjs
git commit -m "fix: compare normalized stages and signal a due payment"
```

---

### Task 4: Endpoint dedicado de recebimento

**Files:**

- Create: `app/api/orders/[orderId]/payment/route.ts`
- Create: `lib/repos/order-payments.ts`
- Test: `tests/order-payment-endpoint.test.mjs`

**Interfaces:**

- Consumes: `Order.payment` (Task 2), invariantes da Task 1.
- Produces: `POST /api/orders/<id>/payment` com corpo
  `{ method?: string; date?: string }`, respondendo `{ payment }` em 201,
  `409 { error, payment }` quando já existe recebimento, 404 quando a OS não
  existe na conta, 400 quando `total <= 0` ou a forma de pagamento está vazia.
  Task 5 e Task 10 chamam este endpoint.
  `lib/repos/order-payments.ts` exporta
  `create(accountId, orderId, { method, date }): Promise<OrderPayment | 'conflict' | 'no-value' | 'invalid-method' | null>`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/order-payment-endpoint.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, auth, payment, cookie;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  auth = await import('../app/api/auth/route.ts');
  payment = await import('../app/api/orders/[orderId]/payment/route.ts');
  const login = await auth.POST(
    new Request('https://test.local/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://test.local' },
      body: JSON.stringify({
        action: 'login',
        username: 'adminreparosm',
        password: 'TestAdminPassword123',
      }),
    }),
  );
  cookie = login.headers.get('set-cookie').split(';')[0];
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, stage)
     VALUES ('order-ep-1', 'account-admin', 'OS-1', 'Ana', 'iPhone', 350, 'Retirada'),
            ('order-ep-free', 'account-admin', 'OS-2', 'Bruno', 'Moto', 0, 'Retirada'),
            ('order-ep-method', 'account-admin', 'OS-3', 'Carla', 'Samsung', 220, 'Retirada'),
            ('order-ep-race', 'account-admin', 'OS-4', 'Diego', 'Motorola', 480, 'Retirada')`,
  );
});
after(async () => db?.drop());

const charge = (orderId, body = {}) =>
  payment.POST(
    new Request(`https://test.local/api/orders/${orderId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://test.local', cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId }) },
  );

test('records the order total, ignoring any value sent by the client', { skip }, async () => {
  const response = await charge('order-ep-1', { method: 'Pix', date: '2026-03-10', value: 10 });
  assert.equal(response.status, 201);
  const { payment: saved } = await response.json();
  assert.equal(saved.value, 350);
  assert.equal(saved.method, 'Pix');
});

test('answers 409 when the order already has a payment', { skip }, async () => {
  const response = await charge('order-ep-1', { method: 'Dinheiro' });
  assert.equal(response.status, 409);
});

test('requires a payment method', { skip }, async () => {
  assert.equal((await charge('order-ep-method', {})).status, 400);
});

test('turns simultaneous confirmations into one success and one conflict', { skip }, async () => {
  const responses = await Promise.all([
    charge('order-ep-race', { method: 'Pix' }),
    charge('order-ep-race', { method: 'Dinheiro' }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort((a, b) => a - b),
    [201, 409],
  );
});

test('refuses an order with no value', { skip }, async () => {
  assert.equal((await charge('order-ep-free', { method: 'Pix' })).status, 400);
});

test('answers 404 for an order outside the account', { skip }, async () => {
  assert.equal((await charge('order-does-not-exist', { method: 'Pix' })).status, 404);
});

// A proteção do vínculo é por omissão: order_id não existe em cashColumns,
// então o CRUD genérico não consegue nem criar nem apagar o vínculo.
test('the generic payment CRUD can neither forge nor clear the link', { skip }, async () => {
  const payments = await import('../app/api/payments/route.ts');
  const post = (body) =>
    payments.POST(
      new Request('https://test.local/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'https://test.local', cookie },
        body: JSON.stringify(body),
      }),
    );

  // Não forja: um orderId no payload é ignorado.
  const created = await post({
    data: { description: 'Avulso', value: 10, orderId: 'order-ep-1' },
  });
  const { record } = await created.json();
  const [forged] = await db.migrationQuery(`SELECT order_id FROM cash_entries WHERE id = $1`, [
    record.id,
  ]);
  assert.equal(forged.order_id, null);

  // Não apaga: editar o recebimento vinculado preserva order_id.
  const [linked] = await db.migrationQuery(
    `SELECT id FROM cash_entries WHERE order_id = 'order-ep-1'`,
  );
  await post({ id: linked.id, data: { description: 'Editado', value: 350 } });
  const [kept] = await db.migrationQuery(`SELECT order_id FROM cash_entries WHERE id = $1`, [
    linked.id,
  ]);
  assert.equal(kept.order_id, 'order-ep-1');
});
```

Este teste só passa se `order_id` **não** for declarado em `cashColumns`
(`lib/repos/rest.ts`). Não acrescente a coluna lá: o upsert do `simpleRepo`
grava todas as colunas declaradas, então declará-la é o que apagaria o
vínculo na primeira edição.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="ignoring any value"`
Expected: FAIL — o módulo da rota não existe.

- [ ] **Step 3: Escrever o repositório**

Crie `lib/repos/order-payments.ts`:

```ts
import { tenantQueryFor, tenantTransaction } from '@/lib/db';
import { dateOrNull, money, textOrNull } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { OrderPayment } from '@/lib/types';

const UNIQUE_VIOLATION = '23505';

export async function get(accountId: string, orderId: string): Promise<OrderPayment | null> {
  const [row] = await tenantQueryFor(accountId)<{
    id: string;
    value: string;
    method: string | null;
    date: string | null;
  }>(
    `SELECT id, value, method, date::text AS date
     FROM cash_entries
     WHERE account_id = $1 AND order_id = $2 AND kind = 'in'`,
    [accountId, orderId],
  );
  return row
    ? { id: row.id, value: money(row.value), method: row.method || '', date: row.date || '' }
    : null;
}

/**
 * Registers the single income entry of an order. The value is never taken
 * from the caller: it is always the order's current total, read in the same
 * transaction.
 *
 * Returns null when the order does not belong to the account, 'no-value'
 * when it has nothing to charge, 'invalid-method' when the required payment
 * method is missing, and 'conflict' when another tab won the race.
 */
export async function create(
  accountId: string,
  orderId: string,
  input: { method?: string; date?: string },
): Promise<OrderPayment | 'conflict' | 'no-value' | 'invalid-method' | null> {
  return tenantTransaction(accountId, async (run) => {
    const [order] = await run<{ total: string }>(
      'SELECT total FROM orders WHERE account_id = $1 AND id = $2',
      [accountId, orderId],
    );
    if (!order) return null;
    const total = money(order.total);
    if (total <= 0) return 'no-value';
    const method = input.method?.trim();
    if (!method) return 'invalid-method';

    const id = `payment-${crypto.randomUUID()}`;
    const date = dateOrNull(input.date) ?? todayInSaoPaulo();
    try {
      const [row] = await run<{ id: string; value: string; method: string | null; date: string }>(
        `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
         VALUES ($1, $2, 'in', $3, $4, $5, $6, $7)
         RETURNING id, value, method, date::text AS date`,
        [id, accountId, `Recebimento da OS`, total, textOrNull(method), date, orderId],
      );
      return { id: row.id, value: money(row.value), method: row.method || '', date: row.date };
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return 'conflict';
      throw error;
    }
  });
}
```

- [ ] **Step 4: Escrever a rota**

Crie `app/api/orders/[orderId]/payment/route.ts`:

```ts
import { currentAccount, sameOrigin } from '@/lib/auth';
import * as orderPayments from '@/lib/repos/order-payments';

type Context = { params: Promise<{ orderId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { orderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  // O valor não é lido do cliente: quem manda é o total atual da OS.
  const { method, date } = (body ?? {}) as { method?: unknown; date?: unknown };

  const result = await orderPayments.create(account.id, orderId, {
    method: typeof method === 'string' ? method : undefined,
    date: typeof date === 'string' ? date : undefined,
  });
  if (result === 'conflict')
    return Response.json(
      {
        error: 'Esta ordem já tem recebimento registrado.',
        payment: await orderPayments.get(account.id, orderId),
      },
      { status: 409 },
    );
  if (result === 'no-value')
    return Response.json({ error: 'Esta ordem não tem valor a receber.' }, { status: 400 });
  if (result === 'invalid-method')
    return Response.json({ error: 'Informe a forma de pagamento.' }, { status: 400 });
  if (!result) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  return Response.json({ payment: result }, { status: 201 });
}
```

- [ ] **Step 5: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="order-payment|409|method|simultaneous|value sent|forge nor clear"`
Expected: PASS nos sete testes.

- [ ] **Step 6: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add app/api/orders lib/repos/order-payments.ts tests/order-payment-endpoint.test.mjs
git commit -m "feat: add a dedicated endpoint for the order payment"
```

---

### Task 5: Diálogo de cobrança em `/ordens` e `/mesa`

**Files:**

- Create: `components/order-payment-dialog.tsx`
- Create: `components/order-payment-status.tsx`
- Modify: `components/orders-route.tsx`, `components/mesa-route.tsx`,
  `components/orders-table.tsx`
- Test: `tests/order-payment-dialog.test.mjs`

**Interfaces:**

- Consumes: `paymentDue` (Task 3), `POST /api/orders/<id>/payment` (Task 4).
- Produces: `<OrderPaymentDialog order={{ id, code, total }} close={() => {}} saved={(payment) => {}} />`.
  Task 10 reusa o mesmo componente em `/pagamentos`. Produz também o
  `OrderPaymentStatus`, que mostra recebido, divergência ou pendência e chama
  `onCharge` quando a OS ainda não tem recebimento.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/order-payment-dialog.test.mjs` (segue o estilo de
`tests/ui-primitives.test.mjs`, renderização sem banco):

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import OrderPaymentDialog from '../components/order-payment-dialog.tsx';
import OrderPaymentStatus from '../components/order-payment-status.tsx';

const render = (total) =>
  renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(OrderPaymentDialog, {
        order: { id: 'order-1', code: 'OS-1', total },
        close: () => {},
        saved: () => {},
      }),
    ),
  );

test('shows the order total as a fixed, non-editable amount', () => {
  const html = render(350);
  assert.match(html, /R\$\s*350,00/);
  assert.doesNotMatch(html, /<input[^>]+name="value"/);
});

test('explains how to charge a different amount', () => {
  assert.match(render(350), /altere o total da OS/i);
});

test('shows payment state and recovery action in the order', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, {
      order: {
        total: 400,
        payment: { id: 'payment-1', value: 350, method: 'Pix', date: '2026-03-31' },
      },
    }),
  );
  assert.match(html, /Recebido R\$\s*350,00 de R\$\s*400,00/);
  assert.doesNotMatch(html, /Registrar recebimento/);
});

test('shows a recovery action for an unpaid order with value', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, {
      order: { total: 350, payment: null },
      onCharge: () => {},
    }),
  );
  assert.match(html, /Pagamento pendente/);
  assert.match(html, /Registrar recebimento/);
});

test('does not render a payment indicator for a zero-total order', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, { order: { total: 0, payment: null } }),
  );
  assert.equal(html, '');
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="non-editable amount"`
Expected: FAIL — o componente não existe.

- [ ] **Step 3: Escrever o componente**

Crie `components/order-payment-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney } from '@/lib/format';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { OrderPayment } from '@/lib/types';

const methods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto'];

export default function OrderPaymentDialog({
  order,
  close,
  saved,
}: {
  order: { id: string; code: string; total: number };
  close: () => void;
  saved: (payment: OrderPayment) => void;
}) {
  const { notify } = useFeedback();
  const [method, setMethod] = useState('Pix');
  const [date, setDate] = useState(todayInSaoPaulo());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, date }),
      });
      const result = (await response.json()) as { error?: string; payment?: OrderPayment | null };
      if (response.status === 409) {
        notify('Esta OS já teve o recebimento registrado em outra aba.', 'error');
        if (result.payment) saved(result.payment);
        else close();
        return;
      }
      if (!response.ok || !result.payment)
        throw new Error(result.error || 'Não foi possível registrar o recebimento.');
      notify('Recebimento registrado.', 'success');
      saved(result.payment);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível registrar o recebimento.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && close()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receber {order.code}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1 rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Valor a receber</p>
            <strong className="text-2xl tabular-nums">{formatMoney(order.total)}</strong>
            <p className="text-xs text-muted-foreground">
              Para cobrar outro valor, altere o total da OS.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="order-payment-method">Forma de pagamento</Label>
            <Select onValueChange={setMethod} value={method}>
              <SelectTrigger id="order-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="order-payment-date">Data</Label>
            <Input
              id="order-payment-date"
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={close} type="button" variant="outline">
            Agora não
          </Button>
          <Button disabled={saving} onClick={submit} type="button">
            {saving ? 'Registrando...' : 'Confirmar recebimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Escrever o indicador de pagamento**

Crie `components/order-payment-status.tsx` para concentrar a leitura do
resumo em todas as telas que mostram uma OS:

```tsx
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import type { OrderPayment } from '@/lib/types';

export default function OrderPaymentStatus({
  order,
  onCharge,
}: {
  order: { total?: number; payment?: OrderPayment | null };
  onCharge?: () => void;
}) {
  const total = Number(order.total || 0);
  if (total <= 0) return null;
  if (!order.payment)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-amber-700 dark:text-amber-300">Pagamento pendente</span>
        {onCharge && (
          <Button onClick={onCharge} size="sm" type="button" variant="outline">
            Registrar recebimento
          </Button>
        )}
      </div>
    );
  const matches = Number(order.payment.value) === total;
  return (
    <p className="text-sm text-muted-foreground">
      {matches
        ? `Recebido ${formatMoney(order.payment.value)}`
        : `Recebido ${formatMoney(order.payment.value)} de ${formatMoney(total)}`}
    </p>
  );
}
```

- [ ] **Step 5: Ligar em `/ordens`**

Em `components/orders-route.tsx`: importe
`import OrderPaymentDialog from '@/components/order-payment-dialog';` e o tipo
`OrderPayment`, acrescente o estado

```tsx
const [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(null);
```

Crie `startCharging(order)` para preencher esse estado e passe-o para
`OrdersTable` como `onCharge`. Em `components/orders-table.tsx`, acrescente a
prop `onCharge?: (order: OrderRow) => void` e renderize
`<OrderPaymentStatus order={order} onCharge={onCharge ? () => onCharge(order) : undefined} />`
no cartão mobile e na célula do total da tabela. Assim o indicador aparece
nas duas apresentações da listagem e a ação abre o diálogo hospedado pela
`OrdersRoute`.

Na função `save`, depois de atualizar `setOrders(...)` com o registro salvo,
acrescente:

```tsx
if (result.paymentDue)
  setCharging({
    id: result.paymentDue.orderId,
    code: saved.code,
    total: result.paymentDue.total,
  });
```

Declare `paymentDue` no tipo da resposta do `fetch`:

```tsx
        paymentDue?: { orderId: string; total: number } | null;
```

E antes do fechamento do JSX, ao lado dos outros modais:

```tsx
{
  charging && (
    <OrderPaymentDialog
      close={() => setCharging(null)}
      order={charging}
      saved={(payment: OrderPayment) => {
        setOrders((current) =>
          current.map((order) => (order.id === charging.id ? { ...order, payment } : order)),
        );
        setCharging(null);
      }}
    />
  );
}
```

- [ ] **Step 6: Ligar em `/mesa`**

Em `components/mesa-route.tsx`, acrescente o estado e a função:

```tsx
const [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(null);

const startCharging = (order: OrderRow) =>
  setCharging({ id: order.id, code: order.code, total: Number(order.total || 0) });
```

Inclua `paymentDue?: { orderId: string; total: number } | null` no tipo da
resposta de `save`. Depois de atualizar `setOrders`, abra o diálogo com
`startCharging({ ...saved, id: result.paymentDue.orderId, total: result.paymentDue.total })`
quando `result.paymentDue` existir. No cartão de cada OS, renderize:

```tsx
<OrderPaymentStatus order={order} onCharge={() => startCharging(order)} />
```

Antes do fechamento do fragmento, renderize o mesmo `OrderPaymentDialog` da
`OrdersRoute`, atualizando a ordem correspondente em `setOrders` dentro de
`saved` e limpando `charging`. O avanço de etapa da Mesa (`move`) chama
`save`, então não precisa de tratamento próprio.

- [ ] **Step 7: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="non-editable|altere o total"`
Expected: PASS nos dois testes.

- [ ] **Step 8: Verificação manual**

Run: `pnpm dev`. Mova uma OS com valor para "Retirada" pela Mesa e pelo modal
de edição em `/ordens`. Confirme: o diálogo abre, o valor é o total e não é
editável, confirmar registra e o indicador da OS muda; cancelar deixa a OS em
Retirada sem lançamento. Mova uma OS de total zero: nada deve abrir.

- [ ] **Step 9: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add components/order-payment-dialog.tsx components/order-payment-status.tsx components/orders-route.tsx components/mesa-route.tsx components/orders-table.tsx tests/order-payment-dialog.test.mjs
git commit -m "feat: confirm the order payment when it reaches pickup"
```

---

## Bloco 2 — Leituras

### Task 6: Fechamento do dia e comparação mensal

**Files:**

- Create: `lib/repos/cash.ts`
- Test: `tests/cash-periods.test.mjs`

**Interfaces:**

- Consumes: `cash_entries.order_id` (Task 1).
- Produces, exportados de `lib/repos/cash.ts`:
  - `type CashTotals = { income: number; expense: number; balance: number }`
  - `type MethodTotal = { method: string; value: number }`
  - `today(accountId, asOfDate?): Promise<CashTotals & { methods: MethodTotal[] }>`
  - `month(accountId, asOfDate?): Promise<{ current: CashTotals; previous: CashTotals }>`
  - `asOfDate` é `YYYY-MM-DD`; o default é `todayInSaoPaulo()`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/cash-periods.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="closes the day"`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Escrever o módulo**

Crie `lib/repos/cash.ts`:

```ts
import { tenantQueryFor, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';

export type CashTotals = { income: number; expense: number; balance: number };
export type MethodTotal = { method: string; value: number };

/**
 * Data de competência: a informada pelo usuário ou, na falta dela, o dia em
 * São Paulo em que o lançamento foi criado. Sem o COALESCE um lançamento sem
 * data sumiria de todos os períodos e continuaria somando no total geral.
 */
const COMPETENCE = `COALESCE(c.date, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date)`;

const totalsOf = (rows: Array<{ kind: string; value: string }>): CashTotals => {
  const income = rows
    .filter((row) => row.kind === 'in')
    .reduce((sum, row) => sum + money(row.value), 0);
  const expense = rows
    .filter((row) => row.kind === 'out')
    .reduce((sum, row) => sum + money(row.value), 0);
  return { income, expense, balance: income - expense };
};

const rangeTotals = async (
  execute: Query,
  accountId: string,
  from: string,
  to: string,
): Promise<CashTotals> => {
  const rows = await execute<{ kind: string; value: string }>(
    `SELECT c.kind, SUM(c.value) AS value FROM cash_entries c
     WHERE c.account_id = $1 AND ${COMPETENCE} BETWEEN $2::date AND $3::date
     GROUP BY c.kind`,
    [accountId, from, to],
  );
  return totalsOf(rows);
};

export async function today(accountId: string, asOfDate = todayInSaoPaulo()) {
  const execute = tenantQueryFor(accountId);
  const totals = await rangeTotals(execute, accountId, asOfDate, asOfDate);
  const methods = await execute<{ method: string; value: string }>(
    `SELECT COALESCE(NULLIF(BTRIM(c.method), ''), 'Não informado') AS method,
            SUM(c.value) AS value
     FROM cash_entries c
     WHERE c.account_id = $1 AND c.kind = 'in' AND ${COMPETENCE} = $2::date
     GROUP BY 1 ORDER BY 2 DESC`,
    [accountId, asOfDate],
  );
  return {
    ...totals,
    methods: methods.map((row) => ({ method: row.method, value: money(row.value) })),
  };
}

export async function month(accountId: string, asOfDate = todayInSaoPaulo()) {
  const execute = tenantQueryFor(accountId);
  const [window] = await execute<{
    current_from: string;
    previous_from: string;
    previous_to: string;
  }>(
    `SELECT date_trunc('month', $1::date)::date::text AS current_from,
            (date_trunc('month', $1::date) - interval '1 month')::date::text AS previous_from,
            -- O LEAST impede que a janela anterior invada o mês corrente:
            -- em 31/03, fevereiro + 30 dias cairia em 03/03.
            LEAST(
              (date_trunc('month', $1::date) - interval '1 month')::date
                + ($1::date - date_trunc('month', $1::date)::date),
              date_trunc('month', $1::date)::date - 1
            )::text AS previous_to`,
    [asOfDate],
  );
  const [current, previous] = await Promise.all([
    rangeTotals(execute, accountId, window.current_from, asOfDate),
    rangeTotals(execute, accountId, window.previous_from, window.previous_to),
  ]);
  return { current, previous };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="day|month|Não informado|December"`
Expected: PASS nos cinco testes.

- [ ] **Step 5: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add lib/repos/cash.ts tests/cash-periods.test.mjs
git commit -m "feat: aggregate the daily close and the month-to-date comparison"
```

---

### Task 7: A receber e Conferir

**Files:**

- Modify: `lib/repos/cash.ts`
- Test: `tests/cash-receivables.test.mjs`

**Interfaces:**

- Consumes: `cash_entries.order_id` (Task 1), `lib/repos/cash.ts` (Task 6).
- Produces:
  - `type ReceivableGroup = { orders: number; amount: number }`
  - `type ReceivableOrder = { id: string; code: string; customer: string; total: number }`
  - `receivables(accountId): Promise<{ ready: ReceivableGroup & { list: ReceivableOrder[] }; inProgress: ReceivableGroup }>`
  - `review(accountId): Promise<{ divergent: { orders: number; toCollect: number; overpaid: number }; cancelledPaid: { orders: number; amount: number } }>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/cash-receivables.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;

const order = (id, code, total, stage, status = 'Aberto') =>
  db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, stage, status)
     VALUES ($1, 'account-rec', $2, 'Ana', 'iPhone', $3, $4, $5)`,
    [id, code, total, stage, status],
  );
const paid = (id, orderId, value) =>
  db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ($1, 'account-rec', 'in', 'OS', $2, $3)`,
    [id, value, orderId],
  );

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-rec', 'rec', 'Rec', 'merchant', 'active', 'x')`,
  );
  await order('order-ready', 'OS-1', 350, 'Retirada');
  await order('order-working', 'OS-2', 200, 'Em reparo');
  await order('order-free', 'OS-3', 0, 'Retirada');
  await order('order-cancelled', 'OS-4', 180, 'Retirada', 'Cancelado');
  await order('order-divergent', 'OS-5', 400, 'Retirada');
  await paid('payment-divergent', 'order-divergent', 350);
  await order('order-overpaid', 'OS-6', 100, 'Retirada');
  await paid('payment-overpaid', 'order-overpaid', 100.01);
  await order('order-cancelled-paid', 'OS-7', 250, 'Retirada', 'Cancelado');
  await paid('payment-cancelled', 'order-cancelled-paid', 250);
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

test('splits receivables between ready for pickup and in progress', { skip }, async () => {
  const result = await cash.receivables('account-rec');
  assert.equal(result.ready.orders, 1);
  assert.equal(result.ready.amount, 350);
  assert.deepEqual(
    result.ready.list.map((item) => item.code),
    ['OS-1'],
  );
  assert.equal(result.inProgress.orders, 1);
  assert.equal(result.inProgress.amount, 200);
});

// Review Focus: a diferença é de 1 centavo; comparar em float no JavaScript
// erraria.
test('separates directional differences without netting them', { skip }, async () => {
  const result = await cash.review('account-rec');
  assert.equal(result.divergent.orders, 2);
  assert.equal(result.divergent.toCollect, 50);
  assert.equal(result.divergent.overpaid, 0.01);
});

test('lists a cancelled order that holds a payment', { skip }, async () => {
  const result = await cash.review('account-rec');
  assert.equal(result.cancelledPaid.orders, 1);
  assert.equal(result.cancelledPaid.amount, 250);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="receivables"`
Expected: FAIL — `cash.receivables` não existe.

- [ ] **Step 3: Implementar**

Acrescente ao final de `lib/repos/cash.ts`:

```ts
export type ReceivableGroup = { orders: number; amount: number };
export type ReceivableOrder = { id: string; code: string; customer: string; total: number };

const UNPAID = `LEFT JOIN cash_entries c
    ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'`;

export async function receivables(accountId: string) {
  const execute = tenantQueryFor(accountId);
  const rows = await execute<{
    id: string;
    code: string;
    customer: string;
    total: string;
    stage: string;
  }>(
    `SELECT o.id, o.code, o.customer, o.total, o.stage
     FROM orders o ${UNPAID}
     WHERE o.account_id = $1 AND o.total > 0 AND o.status <> 'Cancelado' AND c.id IS NULL
     ORDER BY o.updated_at DESC`,
    [accountId],
  );
  const group = (items: typeof rows): ReceivableGroup => ({
    orders: items.length,
    amount: items.reduce((sum, row) => sum + money(row.total), 0),
  });
  const ready = rows.filter((row) => row.stage === 'Retirada');
  return {
    ready: {
      ...group(ready),
      list: ready.map((row) => ({
        id: row.id,
        code: row.code,
        customer: row.customer,
        total: money(row.total),
      })),
    },
    inProgress: group(rows.filter((row) => row.stage !== 'Retirada')),
  };
}

export async function review(accountId: string) {
  const execute = tenantQueryFor(accountId);
  // As diferenças são somadas em numeric no banco: comparar em float no
  // JavaScript erra em centavos. Positivas e negativas vão em colunas
  // separadas para que não se cancelem.
  const [row] = await execute<{
    divergent_orders: string;
    to_collect: string;
    overpaid: string;
    cancelled_orders: string;
    cancelled_amount: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE c.value <> o.total) AS divergent_orders,
       COALESCE(SUM(GREATEST(o.total - c.value, 0)), 0) AS to_collect,
       COALESCE(SUM(GREATEST(c.value - o.total, 0)), 0) AS overpaid,
       COUNT(*) FILTER (WHERE o.status = 'Cancelado') AS cancelled_orders,
       COALESCE(SUM(c.value) FILTER (WHERE o.status = 'Cancelado'), 0) AS cancelled_amount
     FROM orders o
     JOIN cash_entries c
       ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'
     WHERE o.account_id = $1`,
    [accountId],
  );
  return {
    divergent: {
      orders: Number(row.divergent_orders),
      toCollect: money(row.to_collect),
      overpaid: money(row.overpaid),
    },
    cancelledPaid: {
      orders: Number(row.cancelled_orders),
      amount: money(row.cancelled_amount),
    },
  };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="receivables|directional|cancelled order"`
Expected: PASS nos três testes.

- [ ] **Step 5: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add lib/repos/cash.ts tests/cash-receivables.test.mjs
git commit -m "feat: compute receivables and the reconciliation list"
```

---

### Task 8: Histórico filtrado e data padrão em São Paulo

**Files:**

- Modify: `lib/repos/cash.ts`, `components/money-modal.tsx:43`
- Create: `app/api/cash/history/route.ts`
- Test: `tests/cash-history.test.mjs`, `tests/cash-history-route.test.mjs`

**Interfaces:**

- Consumes: `lib/repos/cash.ts` (Tasks 6 e 7).
- Produces:
  - `type CashPeriod = 'today' | 'month' | 'previous-month'`
  - `type CashHistoryRow = { id: string; kind: 'in' | 'out'; description: string; reference: string | null; method: string; date: string; value: number; order: { id: string; code: string } | null }`
  - `history(accountId, period: CashPeriod, asOfDate?): Promise<CashHistoryRow[]>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/cash-history.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-hist', 'hist', 'Hist', 'merchant', 'active', 'x')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-hist', 'account-hist', 'OS-9', 'Ana', 'iPhone', 350)`,
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
     VALUES ('hist-1', 'account-hist', 'in', 'OS-9', 350, 'Pix', DATE '2026-03-31', 'order-hist'),
            ('hist-2', 'account-hist', 'out', 'Aluguel', 900, 'Boleto', DATE '2026-03-02', NULL),
            ('hist-3', 'account-hist', 'in', 'Antigo', 70, 'Pix', DATE '2026-02-15', NULL)`,
  );
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

test('returns only the entries of the chosen period', { skip }, async () => {
  const rows = await cash.history('account-hist', 'today', '2026-03-31');
  assert.deepEqual(
    rows.map((row) => row.id),
    ['hist-1'],
  );
  const month = await cash.history('account-hist', 'month', '2026-03-31');
  assert.deepEqual(month.map((row) => row.id).sort(), ['hist-1', 'hist-2']);
  const previous = await cash.history('account-hist', 'previous-month', '2026-03-31');
  assert.deepEqual(
    previous.map((row) => row.id),
    ['hist-3'],
  );
});

test('carries the originating order when there is one', { skip }, async () => {
  const [row] = await cash.history('account-hist', 'today', '2026-03-31');
  assert.deepEqual(row.order, { id: 'order-hist', code: 'OS-9' });
  const [expense] = await cash.history('account-hist', 'previous-month', '2026-03-31');
  assert.equal(expense.order, null);
});

test('keeps the free-text reference in the filtered history', { skip }, async () => {
  await db.migrationQuery(`UPDATE cash_entries SET reference = 'Balcão' WHERE id = 'hist-1'`);
  const [row] = await cash.history('account-hist', 'today', '2026-03-31');
  assert.equal(row.reference, 'Balcão');
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="chosen period"`
Expected: FAIL — `cash.history` não existe.

- [ ] **Step 3: Implementar o histórico**

Acrescente ao final de `lib/repos/cash.ts`:

```ts
export type CashPeriod = 'today' | 'month' | 'previous-month';
export type CashHistoryRow = {
  id: string;
  kind: 'in' | 'out';
  description: string;
  reference: string | null;
  method: string;
  date: string;
  value: number;
  order: { id: string; code: string } | null;
};

export async function history(
  accountId: string,
  period: CashPeriod,
  asOfDate = todayInSaoPaulo(),
): Promise<CashHistoryRow[]> {
  const execute = tenantQueryFor(accountId);
  const [window] = await execute<{ from: string; to: string }>(
    `SELECT
       CASE $2
         WHEN 'today' THEN $1::date
         WHEN 'month' THEN date_trunc('month', $1::date)::date
         ELSE (date_trunc('month', $1::date) - interval '1 month')::date
       END::text AS "from",
       CASE $2
         WHEN 'previous-month' THEN (date_trunc('month', $1::date) - interval '1 day')::date
         ELSE $1::date
       END::text AS "to"`,
    [asOfDate, period],
  );
  const rows = await execute<{
    id: string;
    kind: 'in' | 'out';
    description: string;
    reference: string | null;
    method: string | null;
    date: string;
    value: string;
    order_id: string | null;
    order_code: string | null;
  }>(
    `SELECT c.id, c.kind, c.description, c.reference, c.method, ${COMPETENCE}::text AS date, c.value,
            c.order_id, o.code AS order_code
     FROM cash_entries c
     LEFT JOIN orders o ON o.account_id = c.account_id AND o.id = c.order_id
     WHERE c.account_id = $1 AND ${COMPETENCE} BETWEEN $2::date AND $3::date
     ORDER BY ${COMPETENCE} DESC, c.created_at DESC`,
    [accountId, window.from, window.to],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    description: row.description,
    reference: row.reference,
    method: row.method?.trim() || 'Não informado',
    date: row.date,
    value: money(row.value),
    order: row.order_id && row.order_code ? { id: row.order_id, code: row.order_code } : null,
  }));
}
```

- [ ] **Step 4: Expor o histórico filtrado para a tela**

Crie `app/api/cash/history/route.ts`. A rota valida o período antes de chamar
o repositório, para que o cliente nunca possa injetar uma expressão no SQL:

```ts
import { currentAccount } from '@/lib/auth';
import { history, type CashPeriod } from '@/lib/repos/cash';

const periods = new Set<CashPeriod>(['today', 'month', 'previous-month']);

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const value = new URL(request.url).searchParams.get('period') || 'today';
  if (!periods.has(value as CashPeriod))
    return Response.json({ error: 'Período inválido' }, { status: 400 });
  return Response.json({ rows: await history(account.id, value as CashPeriod) });
}
```

Crie `tests/cash-history-route.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, route, cookie;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-history-route', 'history-route', 'History Route', 'merchant', 'active', 'x')`,
  );
  const { createSession } = await import('../lib/repos/sessions.ts');
  cookie = `reparosm_session=${await createSession('history-route', 'account-history-route')}`;
  route = await import('../app/api/cash/history/route.ts');
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, date)
     VALUES ('history-route-1', 'account-history-route', 'in', 'Anterior', 25, DATE '2026-02-15')`,
  );
});
after(async () => db?.drop());

const get = (period) =>
  route.GET(
    new Request(`https://test.local/api/cash/history?period=${period}`, {
      headers: { cookie },
    }),
  );

test('returns history through the authenticated period endpoint', { skip }, async () => {
  const response = await get('previous-month');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].id, 'history-route-1');
});

test('rejects an unknown history period', { skip }, async () => {
  assert.equal((await get('invalid')).status, 400);
});
```

- [ ] **Step 5: Corrigir a data padrão do formulário**

Em `components/money-modal.tsx`, acrescente o import

```ts
import { todayInSaoPaulo } from '@/lib/warranty';
```

e troque a linha 43:

```ts
    date: item?.date || todayInSaoPaulo(),
```

`new Date().toISOString().slice(0, 10)` devolve o dia seguinte entre 21h e
meia-noite em São Paulo, datando o lançamento no dia errado.

- [ ] **Step 6: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="chosen period|originating order|reference|authenticated period|unknown history"`
Expected: PASS nos cinco testes.

- [ ] **Step 7: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add lib/repos/cash.ts components/money-modal.tsx app/api/cash/history/route.ts tests/cash-history.test.mjs tests/cash-history-route.test.mjs
git commit -m "feat: filter the cash history by period in the database"
```

---

## Bloco 3 — Telas

### Task 9: Aba Financeiro reorganizada

**Files:**

- Modify: `app/(painel)/pagamentos/page.tsx`, `components/finance-route.tsx`
- Test helper coverage: `tests/finance-route-ui.test.mjs` renders the client
  component inside `FeedbackProvider` and `AppRouterContext`, because the
  component owns dialogs, notifications and `router.refresh()`.
- Test: `tests/finance-route-ui.test.mjs`

**Interfaces:**

- Consumes: `today`, `month`, `receivables`, `review`, `history` (Tasks 6-8).
- Produces: `<FinanceRoute summary={...} initialHistory={...} />`, onde
  `summary = { today, month, receivables, review }` com os tipos daquelas
  funções. Task 10 acrescenta a ação de cobrança a este componente.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/finance-route-ui.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import FinanceRoute from '../components/finance-route.tsx';

const summary = {
  today: {
    income: 790,
    expense: 120,
    balance: 670,
    methods: [{ method: 'Pix', value: 490 }],
  },
  month: {
    current: { income: 890, expense: 120, balance: 770 },
    previous: { income: 900, expense: 0, balance: 900 },
  },
  receivables: {
    ready: {
      orders: 1,
      amount: 350,
      list: [{ id: 'order-1', code: 'OS-1', customer: 'Ana', total: 350 }],
    },
    inProgress: { orders: 1, amount: 200 },
  },
  review: {
    divergent: { orders: 2, toCollect: 50, overpaid: 0.01 },
    cancelledPaid: { orders: 1, amount: 250 },
  },
};

const router = {
  back() {},
  forward() {},
  prefetch: async () => {},
  push() {},
  refresh() {},
  replace() {},
};
const html = () =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        FeedbackProvider,
        null,
        createElement(FinanceRoute, { initialHistory: [], summary }),
      ),
    ),
  );

test('shows the daily close with the breakdown by method', () => {
  const markup = html();
  assert.match(markup, /Hoje/);
  assert.match(markup, /Pix/);
});

test('labels the monthly comparison as the same elapsed period', () => {
  assert.match(html(), /Mesmo período anterior/i);
});

test('keeps the receivable total separate from the reconciliation block', () => {
  const markup = html();
  assert.match(markup, /A receber/i);
  assert.match(markup, /Conferir/i);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="daily close"`
Expected: FAIL — `FinanceRoute` ainda exige `initialPayments`/`initialExpenses`.

- [ ] **Step 3: Carregar os dados no servidor**

Substitua `app/(painel)/pagamentos/page.tsx` por:

```tsx
import FinanceRoute from '@/components/finance-route';
import * as cash from '@/lib/repos/cash';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PaymentsPage() {
  const account = await requireServerAccount();
  const [today, month, receivables, review, history] = await Promise.all([
    cash.today(account.id),
    cash.month(account.id),
    cash.receivables(account.id),
    cash.review(account.id),
    cash.history(account.id, 'today'),
  ]);
  return <FinanceRoute initialHistory={history} summary={{ today, month, receivables, review }} />;
}
```

- [ ] **Step 4: Reescrever o componente**

Em `components/finance-route.tsx`, troque a assinatura e o cálculo de métricas.
As props passam a ser:

```tsx
export default function FinanceRoute({
  summary,
  initialHistory,
}: {
  summary: {
    today: CashTotals & { methods: MethodTotal[] };
    month: { current: CashTotals; previous: CashTotals };
    receivables: Awaited<ReturnType<typeof import('@/lib/repos/cash').receivables>>;
    review: Awaited<ReturnType<typeof import('@/lib/repos/cash').review>>;
  };
  initialHistory: CashHistoryRow[];
});
```

Importe os tipos de `@/lib/repos/cash`. Remova `initialPayments`,
`initialExpenses` e todo o bloco de `metrics` que somava arrays (linhas
106-116 do arquivo atual). Em lugar dele, renderize quatro seções nesta ordem,
cada uma num `<Card>` com o mesmo padrão visual já usado no arquivo:

1. **Hoje** — `summary.today.income`, `.expense`, `.balance` e a lista
   `summary.today.methods` (`method` e `formatMoney(value)`).
2. **Este mês** — `summary.month.current` e, ao lado, `summary.month.previous`
   rotulado **"Mesmo período anterior"**, com a variação calculada por:

```tsx
const variation = (current: number, previous: number) => {
  const absolute = current - previous;
  const percent = previous === 0 ? null : (absolute / previous) * 100;
  return { absolute, percent };
};
```

Exiba o percentual como `—` quando `percent` for `null`.

3. **A receber** — `summary.receivables.ready` (com a lista de OS) e
   `summary.receivables.inProgress` (só soma e contagem).
4. **Conferir** — `summary.review.divergent` (quantidade, "Total a completar",
   "Recebido acima") e `summary.review.cancelledPaid` (quantidade e valor),
   com uma linha de texto explicando que não geram cobrança automática.

Mantenha os botões de lançamento manual, `MoneyModal`, edição, exclusão,
feedback e confirmação existentes. Como o histórico vindo de `cash.history`
usa `kind: 'in' | 'out'` e o modal atual usa `payment | expense`, crie um
adaptador explícito:

```tsx
type FinanceRow = MoneyRow & { order: CashHistoryRow['order'] };

const toFinanceRow = (row: CashHistoryRow): FinanceRow => ({
  ...row,
  kind: row.kind === 'in' ? 'payment' : 'expense',
  reference: row.reference || '',
});
```

Inicialize `rows` com `initialHistory.map(toFinanceRow)`. Ao salvar pelo
`MoneyModal`, preserve `previous.order` quando substituir a linha pelo
registro retornado pelo CRUD; isso impede que editar um recebimento vinculado
faça a OS desaparecer do histórico. Lançamentos manuais novos recebem
`order: null`. Ao excluir, remova a linha e chame `router.refresh()` para
atualizar os cartões agregados no servidor.

Adicione `period` com default `'today'` e um seletor com os rótulos **Hoje**,
**Este mês** e **Mês passado**. Ao trocar, faça
`GET /api/cash/history?period=${period}`, valide `response.ok`, converta o
resultado com `toFinanceRow` e substitua `rows`; em erro, use `notify` e
conserve o período exibido. O histórico usa `row.reference` como texto
secundário e, quando `row.order` existir, substitui essa referência por:

```tsx
import { useRouter } from 'next/navigation';

const router = useRouter();
const [period, setPeriod] = useState<CashPeriod>('today');
const changePeriod = async (next: CashPeriod) => {
  setPeriod(next);
  try {
    const response = await fetch(`/api/cash/history?period=${next}`);
    const result = (await response.json()) as { error?: string; rows?: CashHistoryRow[] };
    if (!response.ok || !result.rows) throw new Error(result.error || 'Histórico indisponível.');
    setRows(result.rows.map(toFinanceRow));
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Histórico indisponível.', 'error');
  }
};
```

```tsx
<Link href={`/ordens?busca=${encodeURIComponent(row.order.code)}`}>{row.order.code}</Link>
```

Renderize esse conteúdo tanto no cartão mobile quanto na tabela. Depois de um
salvamento manual, também chame `router.refresh()` para que Hoje, Este mês,
A receber e Conferir reflitam o banco.

- [ ] **Step 5: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="daily close|elapsed period|reconciliation"`
Expected: PASS nos três testes.

- [ ] **Step 6: Verificação manual**

Run: `pnpm dev`, abra `/pagamentos` nos dois temas e em ~375px. Confirme os
quatro blocos e que os botões de Despesa e Recebimento manual continuam
funcionando.

- [ ] **Step 7: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add "app/(painel)/pagamentos/page.tsx" components/finance-route.tsx tests/finance-route-ui.test.mjs
git commit -m "feat: rebuild the finance tab around concrete periods"
```

---

### Task 10: Recuperar cobrança e link para a OS

**Files:**

- Modify: `components/finance-route.tsx`, `components/orders-route.tsx`,
  `app/(painel)/ordens/page.tsx`
- Test: `tests/finance-recovery-ui.test.mjs`

**Interfaces:**

- Consumes: `<OrderPaymentDialog>` (Task 5), `summary.receivables.ready.list`
  (Task 9).
- Produces: nada que tasks posteriores consumam.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/finance-recovery-ui.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import FinanceRoute from '../components/finance-route.tsx';

const summary = {
  today: { income: 0, expense: 0, balance: 0, methods: [] },
  month: {
    current: { income: 0, expense: 0, balance: 0 },
    previous: { income: 0, expense: 0, balance: 0 },
  },
  receivables: {
    ready: {
      orders: 1,
      amount: 350,
      list: [{ id: 'order-1', code: 'OS-1', customer: 'Ana', total: 350 }],
    },
    inProgress: { orders: 0, amount: 0 },
  },
  review: {
    divergent: { orders: 0, toCollect: 0, overpaid: 0 },
    cancelledPaid: { orders: 0, amount: 0 },
  },
};

const router = {
  back() {},
  forward() {},
  prefetch: async () => {},
  push() {},
  refresh() {},
  replace() {},
};

const render = (element) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(FeedbackProvider, null, element),
    ),
  );

test('offers to record the payment of an order waiting for pickup', () => {
  const markup = render(createElement(FinanceRoute, { initialHistory: [], summary }));
  assert.match(markup, /OS-1/);
  assert.match(markup, /Registrar recebimento/i);
});

test('links a history row to the order in the list', () => {
  const markup = render(
    createElement(FinanceRoute, {
      initialHistory: [
        {
          id: 'hist-1',
          kind: 'in',
          description: 'OS-9',
          reference: null,
          method: 'Pix',
          date: '2026-03-31',
          value: 350,
          order: { id: 'order-hist', code: 'OS-9' },
        },
      ],
      summary,
    }),
  );
  assert.match(markup, /href="\/ordens\?busca=OS-9"/);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="waiting for pickup"`
Expected: FAIL — não há ação nem link.

- [ ] **Step 3: Acrescentar a ação de cobrança**

Em `components/finance-route.tsx`, importe `OrderPaymentDialog` e acrescente o
estado:

```tsx
const [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(null);
```

Na lista de `summary.receivables.ready.list`, cada item ganha o botão:

```tsx
<Button onClick={() => setCharging({ id: item.id, code: item.code, total: item.total })} size="sm">
  Registrar recebimento
</Button>
```

E, junto dos outros modais:

```tsx
{
  charging && (
    <OrderPaymentDialog
      close={() => setCharging(null)}
      order={charging}
      saved={() => {
        setCharging(null);
        router.refresh();
      }}
    />
  );
}
```

Importe `useRouter` de `next/navigation` e declare `const router = useRouter();`.
O `refresh()` recarrega os números do servidor, que são agregados.

- [ ] **Step 4: Linkar a OS no histórico**

Nas duas renderizações do histórico (cartão mobile e tabela), onde hoje aparece
`row.reference`, renderize quando `row.order` existir:

```tsx
<Link className="text-xs underline" href={`/ordens?busca=${encodeURIComponent(row.order.code)}`}>
  {row.order.code}
</Link>
```

- [ ] **Step 5: Semear a busca pelo parâmetro**

Em `app/(painel)/ordens/page.tsx`, receba `searchParams` como Promise e
normalize `busca` antes de renderizar `OrdersRoute`:

```tsx
import OrdersRoute from '@/components/orders-route';
import { orders, shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyDaysFromSetting } from '@/lib/warranty';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string | string[] }>;
}) {
  const account = await requireServerAccount();
  const params = await searchParams;
  const initialQuery = Array.isArray(params.busca) ? params.busca[0] || '' : params.busca || '';
  const [records, shop] = await Promise.all([
    orders.list(account.id),
    shops.get(account.id, 'shop-main'),
  ]);
  const rows = records.map((record) => ({ id: record.id, ...record.data }));
  return (
    <OrdersRoute
      defaultWarrantyDays={warrantyDaysFromSetting(shop?.data.warranty)}
      initialOrders={rows}
      initialQuery={initialQuery}
    />
  );
}
```

Em `components/orders-route.tsx`, acrescente `initialQuery?: string` às props
e use `useState(initialQuery || '')` no estado `query`. O trecho mostrado
acima preserva as consultas e os imports atuais da página; não duplique a
leitura de `orders` ou `shops`. Isso torna `/ordens` deep-linkável sem ativar
`useSearchParams` em um Client Component.

- [ ] **Step 6: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="waiting for pickup|links a history row"`
Expected: PASS nos dois testes.

- [ ] **Step 7: Verificação manual**

Run: `pnpm dev`. Mova uma OS para Retirada e **cancele** o diálogo. Vá em
`/pagamentos`: a OS deve aparecer em "pronto pra retirar" com o botão; clicar
registra o recebimento e os números se atualizam. Clique no código da OS numa
linha do histórico e confirme que `/ordens` abre já filtrado.

- [ ] **Step 8: Verificações e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
git add components/finance-route.tsx components/orders-route.tsx "app/(painel)/ordens/page.tsx" tests/finance-recovery-ui.test.mjs
git commit -m "feat: recover a skipped charge from the finance tab"
```

---

### Task 11: Métrica mensal no painel

**Files:**

- Modify: `app/(painel)/page.tsx`, `components/dashboard-route.tsx:36-38`
- Test: `tests/dashboard-ui.test.mjs` (arquivo existente)

**Interfaces:**

- Consumes: `cash.month` (Task 6).
- Produces: nada que tasks posteriores consumam.

- [ ] **Step 1: Escrever o teste que falha**

Atualize as três chamadas existentes de `DashboardRoute` em
`tests/dashboard-ui.test.mjs` para enviar `monthlyRevenue`: use `0` no teste
de estado vazio, `5000` no teste que espera `aria-valuenow="10"` e `0` no
teste de atividade longa. Depois acrescente este teste usando o mesmo padrão
`createElement` que o arquivo já usa:

```js
test('measures the monthly revenue against the monthly goal', () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardRoute, {
      clients: [],
      expenses: [],
      messages: [],
      monthlyRevenue: 12500,
      orders: [],
      parts: [],
      payments: [],
      quotes: [],
    }),
  );
  assert.match(markup, /Meta mensal/i);
  assert.match(markup, /R\$\s*12\.500,00/);
});
```

O arquivo já importa `createElement`, `renderToStaticMarkup` e
`DashboardRoute`; nenhum import novo é necessário.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm test -- --test-name-pattern="monthly goal"`
Expected: FAIL — a prop não existe e o rótulo é outro.

- [ ] **Step 3: Passar a receita do mês**

Em `app/(painel)/page.tsx`, importe `import * as cash from '@/lib/repos/cash';`,
acrescente `cash.month(account.id)` ao `Promise.all` e passe ao componente:

```tsx
      monthlyRevenue={monthTotals.current.income}
```

nomeando o resultado desestruturado como `monthTotals`.

- [ ] **Step 4: Usar a receita mensal**

Em `components/dashboard-route.tsx`, acrescente `monthlyRevenue: number;` ao
tipo das props e troque as linhas 36-38 por:

```tsx
const revenue = monthlyRevenue;
const goal = 50000;
const progress = Math.max(0, Math.min(100, Math.round((revenue / goal) * 100)));
```

Troque o rótulo da métrica correspondente para **"Meta mensal"**. A soma
`payments.reduce(...)` deixa de existir; `payments` continua sendo recebido
porque alimenta a atividade recente.

- [ ] **Step 5: Rodar os testes**

Run: `pnpm test -- --test-name-pattern="monthly goal"`
Expected: PASS, e `tests/dashboard-ui.test.mjs` inteiro sem regressão.

- [ ] **Step 6: Verificações finais e commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec graft build && pnpm exec graft check
git add "app/(painel)/page.tsx" components/dashboard-route.tsx tests/dashboard-ui.test.mjs
git commit -m "feat: measure dashboard revenue against a monthly goal"
```

---

## Encerramento

- [ ] **Push e PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat: tie the finance tab to the service order flow" --body "Implementa docs/superpowers/specs/2026-10-01-financeiro-ligado-a-os-design.md: o recebimento de uma OS nasce da própria OS (vínculo garantido por FK composta, CHECK e índice único parcial), o estado pago é derivado por LEFT JOIN em vez de coluna, e a aba Financeiro passa a mostrar fechamento do dia, mês contra o mesmo período anterior, a receber e conferir, com agregação em SQL e data de referência injetável.

Muda comportamento observável fora do financeiro: a comparação de etapa em lib/orders.ts passa a usar a etapa normalizada dos dois lados, corrigindo notificações de WhatsApp que disparavam sem mudança real de etapa."
```

Aguarde o CI passar antes de mesclar.

Plano completo e salvo em `docs/superpowers/plans/2026-10-01-financeiro-ligado-a-os.md`.
Revise o arquivo antes da implementação. Para executar, escolha uma destas
abordagens:

- **Subagent-driven** — cada task é implementada por um agente novo e revisada
  antes da próxima, com uma revisão final da branch. É a opção mais rigorosa
  para uma mudança com banco, escrita concorrente e várias telas.
- **Native** — eu implemento todas as tasks nesta sessão e faço uma revisão
  final da branch. É a opção mais rápida e econômica, mantendo os testes e as
  verificações definidos neste plano.
