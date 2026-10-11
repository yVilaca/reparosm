import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import { OrderEditForm } from '../components/order-modals.tsx';
import ServicePicker from '../components/service-picker.tsx';
import { commonServices, joinServices, parseServices } from '../lib/order-services.ts';
import { validateRecord } from '../lib/validation.ts';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the service field turns into tiles and back, in the grid order', () => {
  assert.deepEqual(parseServices('touch, Troca de tela ,Troca do flex,  , Limpeza extra'), {
    selected: ['Troca de tela', 'Touch'],
    other: 'Troca do flex, Limpeza extra',
  });
  assert.deepEqual(parseServices(undefined), { selected: [], other: '' });
  assert.equal(
    joinServices({ selected: ['Touch', 'Troca de tela'], other: ' Troca do flex ' }),
    'Troca de tela, Touch, Troca do flex',
  );
  assert.equal(joinServices({ selected: [], other: '   ' }), '');
  // Ida e volta sem perder nada.
  const saved = joinServices({ selected: ['Conector de carga', 'Software'], other: 'Banho' });
  assert.equal(joinServices(parseServices(saved)), saved);
});

test('tiles are toggle buttons that say when they are picked', () => {
  const html = renderToStaticMarkup(
    createElement(ServicePicker, {
      id: 'services',
      required: true,
      value: { selected: ['Troca de tela', 'Touch'], other: 'Troca do flex' },
      onChange: () => {},
    }),
  );
  assert.match(text(html), /Serviços a realizar \*/);
  assert.match(
    html,
    /role="group" aria-labelledby="services-label"|aria-labelledby="services-label"[^>]*role="group"/,
  );
  assert.equal((html.match(/<button/g) || []).length, commonServices.length);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 2);
  assert.match(html, /aria-pressed="true"[^>]*>.*?Troca de tela/);
  assert.match(html, /aria-pressed="false"[^>]*>.*?Troca de bateria/);
  assert.match(
    html,
    /id="services-other"[^>]*value="Troca do flex"|value="Troca do flex"[^>]*id="services-other"/,
  );
});

test('editing an order shows its services already picked', () => {
  const html = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(OrderEditForm, {
        item: {
          id: 'order-1',
          code: 'OS-1',
          customer: 'Ana',
          device: 'iPhone 11',
          service: 'Troca de bateria, Banho químico',
        },
        save: async () => {},
        controls: { cancel() {}, saved() {}, markDirty() {} },
      }),
    ),
  );
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /aria-pressed="true"[^>]*>.*?Troca de bateria/);
  assert.match(html, /value="Banho químico"/);
});

test('the server accepts the service only as text', () => {
  const order = { customer: 'Ana', device: 'iPhone' };
  assert.equal(validateRecord('order', { ...order, service: 'Troca de tela, Touch' }).ok, true);
  assert.equal(validateRecord('order', { ...order, service: ['Troca de tela'] }).ok, false);
  assert.equal(validateRecord('order', { ...order }).ok, true, 'sem problema relatado também vale');
});
