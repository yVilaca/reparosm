import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import FilmsRoute from '../components/films-route.tsx';
import { loadExportRecords } from '../components/data-tools-route.tsx';
import { formatMoney } from '../lib/format.ts';
import { filmCatalog } from '../lib/film-catalog.ts';

test('large film catalogs render a bounded page while retaining all filter matches', () => {
  const films = Array.from({ length: 120 }, (_, index) => ({
    id: `film-${index}`,
    brand: 'Marca',
    model: `Modelo ${index + 1}`,
    compatible: 'Compatível',
    editable: false,
  }));
  const html = renderToStaticMarkup(
    createElement(FeedbackProvider, null, createElement(FilmsRoute, { initialFilms: films })),
  );
  assert.equal((html.match(/Adicionar à loja<\/button>/g) || []).length, 36);
  assert.match(html, new RegExp(`${120 + filmCatalog.length} compatibilidades`));
  assert.match(html, /Próxima/);
  assert.doesNotMatch(html, /<h3[^>]*>Modelo 120<\/h3>/);
});

test('export loads only the requested resource, preserves catalog films and reports failures', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    return Response.json({ records: [{ id: 'example', data: { name: 'Example' } }] });
  });
  const clients = await loadExportRecords('client');
  assert.equal(clients.length, 1);
  assert.deepEqual(calls, ['/api/clients']);
  const films = await loadExportRecords('film');
  assert.ok(films.length > 1);
  assert.equal(calls[1], '/api/films');
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Não autenticado' }, { status: 401 }),
  );
  await assert.rejects(loadExportRecords('order'), /Não autenticado/);
});

test('shared currency formatter preserves Portuguese currency and invalid-value fallback', () => {
  for (const value of [0, 0.01, -12.5, 1500, '10.2', null, undefined, 'invalid', Infinity]) {
    const number = Number(value ?? 0);
    assert.equal(
      formatMoney(value),
      (Number.isFinite(number) ? number : 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    );
  }
});
