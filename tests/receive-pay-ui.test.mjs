import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import { installmentPreview } from '../components/payable-form-dialog.tsx';
import { paymentDifference } from '../components/payable-pay-dialog.tsx';
import ReceivePayRoute from '../components/receive-pay-route.tsx';
import { todayInSaoPaulo } from '../lib/warranty.ts';

const today = todayInSaoPaulo();
const shift = (days) =>
  new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const bill = (id, data) => ({ id, data: { status: 'pending', source: 'other', ...data } });
const order = (id, data) => ({
  id,
  code: `OS-${id}`,
  customer: `Cliente ${id}`,
  device: 'iPhone 13',
  phone: '11987650000',
  stage: 'Em reparo',
  status: 'Aberto',
  days: 0,
  ...data,
});

const orders = [
  order('48', {
    customer: 'Thiago Martins',
    total: 520,
    stage: 'Retirada',
    status: 'Concluído',
    days: 2,
  }),
  order('42', { customer: 'Rafael Lima', total: 280, stage: 'Retirada', days: 1 }),
  order('51', { customer: 'Ana Souza', total: 650, stage: 'Diagnóstico' }),
];
const payables = [
  bill('payable-late', {
    description: 'Conta de energia',
    supplier: 'Enel',
    amount: 412.35,
    dueDate: shift(-3),
  }),
  bill('payable-today', {
    description: 'Internet',
    supplier: 'Vivo',
    amount: 120,
    dueDate: today,
    paymentCode: '34191.79001 01043.510047',
  }),
  bill('payable-rent', {
    description: 'Aluguel da loja',
    amount: 1800,
    dueDate: shift(5),
    recurrence: 'monthly',
  }),
  bill('payable-paid', {
    description: 'Contador',
    amount: 250,
    status: 'paid',
    paidOn: today,
    paidAmount: 262.5,
    method: 'Pix',
  }),
];
const receipts = [
  {
    id: 'payment-1',
    orderId: '40',
    code: 'OS-40',
    customer: 'Bruna Alves',
    device: 'Moto G84',
    value: 180,
    method: 'Dinheiro',
    date: today,
  },
];

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { refresh() {}, replace() {} } },
      createElement(
        FeedbackProvider,
        null,
        createElement(ReceivePayRoute, {
          initialOrders: orders,
          initialPayables: payables,
          initialReceipts: receipts,
          historySince: shift(-60),
          ...props,
        }),
      ),
    ),
  );
const section = (markup, title) => {
  const start = markup.indexOf(`aria-label="${title}"`);
  assert.ok(start > 0, `sem o grupo ${title}`);
  const end = markup.indexOf('</section>', start);
  return markup.slice(start, end);
};

test('puts what to receive and what to pay in the same urgency groups', () => {
  const markup = render();
  const late = section(markup, 'Atrasados');
  assert.match(late, /Conta de energia/);
  assert.match(late, /Thiago Martins/);
  assert.match(late, /\+R\$\s*520,00/);
  assert.match(late, /−R\$\s*412,35/);
  const todayGroup = section(markup, 'Hoje');
  assert.match(todayGroup, /Rafael Lima.*Pronta para retirada há 1 dia/s);
  assert.match(todayGroup, /Internet/);
  assert.match(section(markup, 'Próximos 7 dias'), /Aluguel da loja/);
  assert.match(section(markup, 'No conserto'), /Ana Souza.*Diagnóstico/s);
  // Já pago e já recebido ficam na outra visão.
  assert.doesNotMatch(markup, /Contador|Bruna Alves/);
});

test('summarises what can be collected now and what is due within 7 days', () => {
  const markup = render();
  assert.match(
    markup,
    /Para receber.*R\$\s*800,00.*2 OS prontas para cobrar.*\+ R\$\s*650,00 no conserto/s,
  );
  assert.match(markup, /Para pagar.*R\$\s*2\.332,35.*3 contas até.*R\$\s*412,35 já vencido/s);
});

test('each row says its direction and offers the matching action', () => {
  const markup = render();
  assert.equal((markup.match(/>Receber</g) || []).length, 4); // 3 OS + o filtro
  assert.equal((markup.match(/>Pagar</g) || []).length, 4); // 3 contas + o filtro
  assert.match(markup, /<span class="sr-only">Receber: <\/span>Thiago Martins/);
  assert.match(markup, /<span class="sr-only">Pagar: <\/span>Conta de energia/);
  assert.equal((markup.match(/aria-label="Mais ações: /g) || []).length, 6);
});

test('the receive filter shows only orders, the pay filter only bills', () => {
  const receive = render({ view: 'receive' });
  assert.match(receive, /Thiago Martins/);
  assert.doesNotMatch(receive, /Conta de energia|Aluguel da loja/);
  const pay = render({ view: 'pay' });
  assert.match(pay, /Conta de energia/);
  assert.doesNotMatch(pay, /Thiago Martins|Ana Souza/);
  // O resumo continua mostrando os dois lados.
  assert.match(pay, /Para receber.*R\$\s*800,00/s);
});

test('a link to an already paid bill opens on paid and received, by month', () => {
  const markup = render({ payId: 'payable-paid' });
  assert.match(markup, /Contador/);
  assert.match(markup, /Pago em \d{2}\/\d{2}\/\d{4} · Pix · R\$\s*12,50 de juros ou multa/);
  assert.match(markup, /Bruna Alves.*\+R\$\s*180,00.*Recebido em \d{2}\/\d{2}\/\d{4} · Dinheiro/s);
  assert.match(markup, /histórico completo fica no/);
  assert.doesNotMatch(markup, /Conta de energia/);
});

test('says when everything is settled', () => {
  const markup = render({ initialOrders: [], initialPayables: [], initialReceipts: [] });
  assert.match(markup, /Tudo em dia/);
  assert.match(render({ initialOrders: [], view: 'receive' }), /Ninguém te deve agora/);
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
});
