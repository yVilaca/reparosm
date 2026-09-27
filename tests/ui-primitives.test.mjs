import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PageHeader from '../components/ui/page-header.tsx';
import EmptyState from '../components/ui/empty-state.tsx';

test('PageHeader renders title, description and action', () => {
  const html = renderToStaticMarkup(
    createElement(PageHeader, {
      title: 'Ordens',
      description: 'Gerencie as OS da loja',
      action: createElement('button', null, 'Nova OS'),
    }),
  );
  assert.match(html, /Ordens/);
  assert.match(html, /Gerencie as OS da loja/);
  assert.match(html, /Nova OS/);
});

test('EmptyState renders title without description when omitted', () => {
  const html = renderToStaticMarkup(createElement(EmptyState, { title: 'Nada por aqui' }));
  assert.match(html, /Nada por aqui/);
});
