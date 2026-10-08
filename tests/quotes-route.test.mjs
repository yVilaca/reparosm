import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import QuotesRoute from '../components/quotes-route.tsx';

const quote = (id, data) => ({
  id,
  code: `ORC-${id}`,
  customer: `Cliente ${id}`,
  phone: '11999999999',
  device: 'iPhone 15',
  service: 'Troca de tela',
  total: 150,
  status: 'Aguardando',
  createdAt: new Date().toISOString(),
  ...data,
});
const render = (initialQuotes) =>
  renderToStaticMarkup(
    createElement(FeedbackProvider, null, createElement(QuotesRoute, { initialQuotes })),
  );

test('a long problem description wraps instead of overflowing', () => {
  const problem = 'The phone display does not turn on after being dropped';
  const html = render([quote('1', { problem })]);
  const line = html.match(new RegExp(`<p[^>]*>[^<]*${problem}</p>`))?.[0];
  assert.ok(line, 'the problem description is rendered');
  assert.match(line, /break-words/);
  assert.doesNotMatch(line, /whitespace-nowrap/);
});

test('groups quotes by decision, with one visible action and the rest in a menu', () => {
  const html = render([
    quote('1', { status: 'Aguardando', total: 1850 }),
    quote('2', { status: 'Aprovado', total: 340 }),
    quote('3', { status: 'Recusado', total: 250 }),
  ]);
  const order = ['Esperando resposta', 'Aprovados', 'Recusados'].map((title) =>
    html.indexOf(`aria-label="${title}"`),
  );
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.match(html, />Enviar</);
  assert.equal((html.match(/aria-label="Mais ações: /g) || []).length, 3);
  // Excluir não fica exposto na lista.
  assert.doesNotMatch(html, />Excluir</);
});

test('a quote waiting for two days or more asks to follow up', () => {
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const html = render([quote('9', { createdAt: old })]);
  assert.match(html, /Esperando há 3 dias/);
  assert.match(html, />Cobrar</);
});

test('the quote itself opens its record, where it can be edited', () => {
  const html = render([quote('7', { status: 'Aprovado', customer: 'Diego Santos' })]);
  // A linha é clicável: o nome do cliente é o botão que abre a ficha.
  assert.match(html, /<button[^>]*aria-label="Ver orçamento ORC-7"[^>]*>Diego Santos<\/button>/);
  assert.match(html, /<li class="[^"]*relative[^"]*hover:bg-muted/);
});
