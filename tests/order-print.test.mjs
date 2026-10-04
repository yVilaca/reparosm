import assert from 'node:assert/strict';
import test from 'node:test';
import { orderPrintUrl, parsePrintOrderIds, normalizePrintLayout } from '../lib/print.ts';
import { validateRecord } from '../lib/validation.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CompactOrderPrint from '../components/compact-order-print.tsx';
import FullOrderPrint from '../components/full-order-print.tsx';
import PrintOrderButton from '../components/print-order-button.tsx';

test('complete and compact actions use distinct URLs for single and multiple selections', () => {
  assert.equal(normalizePrintLayout(), 'full');
  assert.equal(orderPrintUrl(['a'], 'full'), '/ordens/a/imprimir');
  assert.equal(orderPrintUrl(['a'], 'compact'), '/ordens/a/imprimir?layout=compact');
  const url = new URL(orderPrintUrl(['a', 'b'], 'compact'), 'http://localhost');
  assert.equal(url.searchParams.get('layout'), 'compact');
  assert.deepEqual(url.searchParams.getAll('id'), ['a', 'b']);
});

test('only the complete print action offers a copies selector', () => {
  const full = renderToStaticMarkup(createElement(PrintOrderButton, { layout: 'full', copies: 1 }));
  const compact = renderToStaticMarkup(
    createElement(PrintOrderButton, { layout: 'compact', copies: 2 }),
  );
  assert.match(full, /id="print-copies"/);
  assert.doesNotMatch(compact, /<select/);
  assert.doesNotMatch(full, /id="print-layout"/);
  assert.doesNotMatch(compact, /id="print-layout"/);
});

test('each selected OS has two copies with the client message only below the cut', () => {
  const message = 'Guarde esta via. <script>alert(1)</script>';
  const html = renderToStaticMarkup(
    createElement(CompactOrderPrint, {
      orders: [
        { id: 'one', data: { code: 'OS-1', customer: 'Ana', device: 'iPhone', total: 100 } },
        { id: 'two', data: { code: 'OS-2', customer: 'Bia', device: 'Moto', total: 200 } },
      ],
      shop: { name: 'Assistência', customerPrintMessage: message },
      issuedAt: '2026-10-03T15:00:00Z',
    }),
  );
  assert.equal((html.match(/class="compact-sheet"/g) || []).length, 2);
  assert.equal((html.match(/class="compact-copy"/g) || []).length, 4);
  assert.equal((html.match(/class="compact-cut"/g) || []).length, 2);
  assert.equal((html.match(/class="compact-message"/g) || []).length, 2);
  assert.match(
    html,
    /aria-label="OS-1 — Via do cliente"><div class="compact-content"><p class="compact-message"/,
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('compact and full printing preserve labor visibility and warranty dates', () => {
  const data = {
    code: 'OS-1',
    customer: 'Ana',
    device: 'Moto',
    labor: 123,
    parts: 50,
    total: 173,
    warrantyDays: 90,
    deliveredAt: '2026-10-03',
  };
  const html = renderToStaticMarkup(
    createElement(CompactOrderPrint, {
      orders: [{ id: 'one', data }],
      shop: { showLaborOnPrint: false },
      issuedAt: '2026-10-03T15:00:00Z',
    }),
  );
  assert.doesNotMatch(html, /Mão de obra/);
  assert.match(html, /03\/10\/2026/);
  assert.match(html, /173,00/);
  const full = renderToStaticMarkup(
    createElement(FullOrderPrint, {
      data,
      shop: { showLaborOnPrint: false, customerPrintMessage: 'Obrigado!' },
      photos: [],
      copies: 2,
      issuedAt: '2026-10-03T15:00:00Z',
    }),
  );
  assert.doesNotMatch(full, /Mão de obra/);
  assert.equal((full.match(/Obrigado!/g) || []).length, 1);
});

test('prints multiple distinct orders through one URL without dropping IDs', () => {
  const url = new URL(orderPrintUrl(['a', 'b', 'a']), 'http://localhost');
  assert.equal(url.pathname, '/ordens/imprimir');
  assert.deepEqual(url.searchParams.getAll('id'), ['a', 'b']);
  assert.equal(orderPrintUrl(['a/b']), '/ordens/a%2Fb/imprimir');
  assert.equal(orderPrintUrl([]), null);
});

test('validates the print selection without silently truncating it', () => {
  assert.deepEqual(parsePrintOrderIds(['a', 'a', ' b ']), ['a', 'b']);
  assert.equal(parsePrintOrderIds(), null);
  assert.equal(parsePrintOrderIds(['a', '']), null);
  assert.equal(parsePrintOrderIds(Array.from({ length: 101 }, (_, i) => String(i))), null);
  assert.equal(normalizePrintLayout(), 'full');
  assert.equal(normalizePrintLayout('compact'), 'compact');
  assert.equal(normalizePrintLayout('full'), 'full');
  assert.equal(normalizePrintLayout('invalid'), 'full');
});

test('validates the custom customer-copy message at the API boundary', () => {
  const shop = { name: 'Assistência', phone: '11987654321' };
  assert.equal(validateRecord('shop', { ...shop, customerPrintMessage: 'Obrigado!' }).ok, true);
  assert.equal(validateRecord('shop', { ...shop, customerPrintMessage: { text: 'x' } }).ok, false);
  assert.equal(
    validateRecord('shop', { ...shop, customerPrintMessage: 'x'.repeat(501) }).ok,
    false,
  );
  assert.equal(validateRecord('shop', { ...shop, customerPrintMessage: '' }).ok, true);
});
