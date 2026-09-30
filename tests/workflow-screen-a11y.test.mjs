import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AfterSalesRoute from '../components/after-sales-route.tsx';
import { FeedbackProvider } from '../components/feedback.tsx';
import FilmsRoute from '../components/films-route.tsx';

const withFeedback = (route) => renderToStaticMarkup(createElement(FeedbackProvider, null, route));

test('after-sales contact can be cleared with an accessible control', () => {
  const html = withFeedback(
    createElement(AfterSalesRoute, {
      initialAutomations: [],
      initialMessages: [],
      clients: [],
      orders: [],
    }),
  );

  assert.match(
    html,
    /<button(?=[^>]*aria-label="Limpar contato selecionado")(?=[^>]*disabled="")[^>]*>Limpar<\/button>/,
  );
});

test('film search has a persistent accessible label and selected filters expose state', () => {
  const html = withFeedback(
    createElement(FilmsRoute, {
      initialFilms: [
        {
          id: 'film-1',
          brand: 'Apple',
          model: 'iPhone 16',
          compatible: 'iPhone 16 Pro',
          size: '6.3 polegadas',
          editable: true,
        },
      ],
    }),
  );

  assert.match(html, /<label[^>]*for="film-search"[^>]*>Buscar películas<\/label>/);
  assert.match(html, /<input[^>]*id="film-search"/);
  assert.match(html, /aria-pressed="false"[^>]*>Minha loja/);
  assert.match(html, /aria-pressed="true">Todas<\/button>/);
  assert.match(html, /aria-pressed="false">Apple<\/button>/);
});
