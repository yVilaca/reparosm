import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import QuotesRoute from '../components/quotes-route.tsx';

test('quote problem stays bounded and wraps in the desktop table', () => {
  const problem = 'The phone display does not turn on after being dropped';
  const html = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(QuotesRoute, {
        initialQuotes: [
          {
            id: 'quote-1',
            code: 'ORC-1',
            customer: 'Cliente',
            phone: '11999999999',
            device: 'iPhone 15',
            problem,
            service: 'Troca de tela',
            notes: '',
            labor: 100,
            parts: 50,
            total: 150,
            validUntil: '',
            status: 'Aguardando',
            createdAt: '2026-09-28T12:00:00.000Z',
            updatedAt: '2026-09-28T12:00:00.000Z',
          },
        ],
      }),
    ),
  );
  const descriptionCell = html.match(new RegExp(`<td[^>]*>${problem}</td>`))?.[0];

  assert.ok(descriptionCell, 'the desktop table renders the problem description');
  assert.match(descriptionCell, /max-w-\[190px\]/);
  assert.match(descriptionCell, /whitespace-normal/);
  assert.match(descriptionCell, /break-words/);
  assert.doesNotMatch(descriptionCell, /whitespace-nowrap/);
});
