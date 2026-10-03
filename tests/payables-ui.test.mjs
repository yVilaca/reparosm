import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import { installmentPreview } from '../components/payable-form-dialog.tsx';
import { paymentDifference } from '../components/payable-pay-dialog.tsx';
import PayablesRoute from '../components/payables-route.tsx';
import { todayInSaoPaulo } from '../lib/warranty.ts';

const today = todayInSaoPaulo();
const shift = (days) =>
  new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const record = (id, data) => ({
  id,
  data: { status: 'pending', source: 'other', ...data },
});

const fixtures = [
  record('late', {
    description: 'Conta de energia',
    supplier: 'Enel',
    amount: 412.35,
    dueDate: shift(-3),
  }),
  record('today', {
    description: 'Internet',
    supplier: 'Vivo',
    amount: 120,
    dueDate: today,
    paymentCode: '34191.79001 01043.510047',
  }),
  record('rent', {
    description: 'Aluguel da loja',
    amount: 1800,
    dueDate: shift(5),
    recurrence: 'monthly',
  }),
  record('screens-2', {
    description: 'Lote de telas',
    supplier: 'Distribuidora Tech',
    source: 'purchase',
    amount: 333.33,
    dueDate: shift(40),
    installmentNumber: 2,
    installmentCount: 3,
  }),
  record('paid', {
    description: 'Contador',
    amount: 250,
    status: 'paid',
    paidOn: today,
    paidAmount: 262.5,
    method: 'Pix',
  }),
];

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { refresh() {}, replace() {} } },
      createElement(
        FeedbackProvider,
        null,
        createElement(PayablesRoute, { initialPayables: fixtures, ...props }),
      ),
    ),
  );

test('groups open bills by urgency with a total for each group', () => {
  const markup = render();
  const order = ['Vencidas', 'Vencem hoje', 'Próximos 7 dias', 'Mais adiante'].map((title) =>
    markup.indexOf(`aria-label="${title}"`),
  );
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.match(markup, /Venceu há 3 dias/);
  assert.match(markup, /Vence hoje/);
  assert.match(markup, /Parcela 2 de 3/);
  assert.match(markup, /Repete · Mensal/);
  // Pagas ficam na outra aba.
  assert.doesNotMatch(markup, /Contador/);
});

test('summarises overdue, the next 7 days and what was paid this month', () => {
  const markup = render();
  assert.match(markup, /Vencidas.*R\$\s*412,35.*1 conta</s);
  const weekEnd = `${shift(7).slice(8)}/${shift(7).slice(5, 7)}`;
  assert.match(
    markup,
    new RegExp(`Próximos 7 dias.*R\\$\\s*1\\.920,00.*2 contas, até ${weekEnd}`, 's'),
  );
  assert.match(markup, /Pago em .*R\$\s*262,50.*1 conta paga/s);
});

test('each open bill has one primary action and a menu for the rest', () => {
  const markup = render();
  assert.equal((markup.match(/>Pagar</g) || []).length, 4);
  assert.equal((markup.match(/aria-label="Mais ações: /g) || []).length, 4);
  assert.doesNotMatch(markup, /Marcar como paga|window\.prompt/);
});

test('the purchases page lists only purchases', () => {
  const markup = render({ mode: 'purchases', title: 'Compras' });
  assert.match(markup, /Lote de telas/);
  assert.doesNotMatch(markup, /Conta de energia|Aluguel da loja/);
  assert.match(markup, /Nova compra/);
});

test('a link to an already paid bill opens on the paid tab', () => {
  const markup = render({ payId: 'paid' });
  assert.match(markup, /Contador/);
  assert.match(markup, /Pago em \d{2}\/\d{2}\/\d{4} · Pix · R\$\s*12,50 de juros ou multa/);
  assert.doesNotMatch(markup, /Conta de energia/);
});

test('invites to register the first bill when there is none', () => {
  const markup = render({ initialPayables: [] });
  assert.match(markup, /Nenhuma conta em aberto/);
});

test('explains the difference between paid and billed amounts', () => {
  assert.equal(paymentDifference(100, 100), null);
  assert.match(paymentDifference(100, 103.4), /R\$\s*3,40 de juros ou multa/);
  assert.match(paymentDifference(100, 95), /R\$\s*5,00 de desconto/);
});

test('previews installments before creating them', () => {
  const preview = installmentPreview(1000, 3, '2027-01-31');
  assert.match(preview.value, /2× de R\$\s*333,33 e a última de R\$\s*333,34/);
  assert.equal(preview.due, '31/01, 28/02, 31/03');
  assert.match(installmentPreview(600, 6, '2027-01-10').due, /… até 10\/06\/2027$/);
  assert.equal(installmentPreview(1000, 1, '2027-01-31'), null);
  assert.equal(installmentPreview(1000, 3, ''), null);
});
