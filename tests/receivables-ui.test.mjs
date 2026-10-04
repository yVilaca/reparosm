import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import ReceivablesRoute from '../components/receivables-route.tsx';

const render = (pending) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      {
        value: { refresh() {} },
      },
      createElement(ReceivablesRoute, {
        ready: { orders: 1, amount: 350, list: [] },
        inProgress: { orders: 1, amount: 200 },
        pending,
      }),
    ),
  );

test('shows an unpaid order still in service with its status and receipt action', () => {
  const markup = render({
    orders: 2,
    amount: 550,
    list: [
      { id: 'o1', code: 'OS-1', customer: 'Ana', device: 'iPhone', status: 'Aberto', total: 200 },
      {
        id: 'o2',
        code: 'OS-2',
        customer: 'Bia',
        device: 'Galaxy',
        status: 'Concluído',
        total: 350,
      },
    ],
  });
  assert.match(markup, /OS-1/);
  assert.match(markup, /iPhone/);
  assert.match(markup, /Aberto/);
  assert.match(markup, /R\$\s*550,00/);
  assert.equal((markup.match(/Registrar recebimento/g) || []).length, 2);
  assert.doesNotMatch(markup, /fora da cobrança|Entra aqui ao concluir/);
});

test('shows no pending orders only when the full unpaid list is empty', () => {
  const markup = render({ orders: 0, amount: 0, list: [] });
  assert.match(markup, /Nada pendente/);
  assert.doesNotMatch(markup, /Registrar recebimento/);
});
