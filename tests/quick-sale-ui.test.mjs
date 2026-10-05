import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import QuickSaleRoute from '../components/quick-sale-route.tsx';

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { refresh() {} } },
      createElement(FeedbackProvider, null, createElement(QuickSaleRoute, props)),
    ),
  );

test('asks only what was sold, the amount and how it was paid', () => {
  const html = render();
  assert.match(html, /Venda rápida/);
  assert.match(html, /name="description"/);
  // Valor em texto com teclado numérico: aceita vírgula ("25,90").
  assert.match(
    html,
    /id="sale-value"[^>]*inputMode="decimal"|inputmode="decimal"[^>]*id="sale-value"/i,
  );
  // Forma de pagamento em botões grandes, Pix já escolhido.
  assert.equal((html.match(/name="method"/g) || []).length, 5);
  assert.match(html, /name="method" checked="" value="Pix"/);
  assert.match(html, />Receber</);
  assert.match(html, /href="\/pagamentos\/historico"/);
});

test('one tap fills a frequent item', () => {
  const html = render({ suggestions: [{ description: 'Película 3D', value: 30 }] });
  assert.match(html, /Vendidos com frequência/);
  assert.match(html, /Película 3D<span[^>]*>R\$\s*30,00/);
});

test("shows today's sales with the total and a way to undo", () => {
  const html = render({
    todaySales: [
      { id: 'payment-1', description: 'Capinha', value: 45, method: 'Pix' },
      { id: 'payment-2', description: 'Carregador', value: 60.5, method: 'Dinheiro' },
    ],
  });
  assert.match(html, /Vendido hoje.*R\$\s*105,50.*2 vendas rápidas/s);
  assert.match(html, /Capinha/);
  assert.match(html, /\+R\$\s*60,50/);
  assert.equal((html.match(/aria-label="Mais ações: /g) || []).length, 2);
});

test('invites the first sale when there is none today', () => {
  assert.match(render(), /As vendas de hoje aparecem aqui/);
});

test('what was sold is a stock search that also accepts free text', () => {
  const html = render({
    products: [{ id: 'p1', name: 'Película 3D iPhone 15', price: 60, cost: 12, stock: 40 }],
  });
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-controls="sale-products"/);
  assert.match(html, /Busque no estoque ou digite livremente/);
});

test('takes a discount in reais or percent, and an optional cost', () => {
  const html = render();
  assert.match(html, /id="sale-discount"[^>]*placeholder="R\$ ou %"/);
  assert.match(html, /id="sale-cost"/);
  assert.match(html, /Custo <span[^>]*>\(opcional\)/);
});

test("today's sales show the discount given and the profit", () => {
  const html = render({
    todaySales: [
      {
        id: 'payment-1',
        description: 'Película 3D',
        value: 54,
        discount: 6,
        cost: 12,
        method: 'Pix',
      },
      { id: 'payment-2', description: 'Conserto de botão', value: 35, method: 'Dinheiro' },
    ],
  });
  assert.match(html, /desconto R\$\s*6,00/);
  assert.match(html, /lucro R\$\s*42,00<\/p>/);
  // O total do dia avisa que uma venda ficou sem custo.
  assert.match(html, /lucro R\$\s*42,00<\/span> \(1 sem custo\)/);
});
