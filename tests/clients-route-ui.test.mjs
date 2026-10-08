import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import ClientsRoute from '../components/clients-route.tsx';

const render = (initialClients) =>
  renderToStaticMarkup(
    createElement(FeedbackProvider, null, createElement(ClientsRoute, { initialClients })),
  );

test('the client itself opens the record, on desktop and mobile', () => {
  const html = render([
    { id: 'client-1', name: 'Ana Souza', phone: '11987654321', status: 'Em atendimento' },
  ]);
  const openers =
    html.match(/<button[^>]*aria-label="Ver cliente Ana Souza"[^>]*>Ana Souza</g) || [];
  assert.equal(openers.length, 2);
  // Desktop: a linha toda é clicável. Celular: a área do nome cobre o cartão.
  assert.match(html, /<tr\b[^>]*cursor-pointer/);
  assert.match(html, /after:absolute after:inset-0/);
  // Conversar continua à vista; editar e excluir ficam na ficha e no menu.
  assert.match(html, />Conversar</);
  assert.doesNotMatch(html, />Editar</);
});
