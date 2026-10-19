import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import FullOrderPrint from '../components/full-order-print.tsx';
import OrderSignatures from '../components/order-signatures.tsx';
import PrintSignature, { signatureNote } from '../components/print-signature.tsx';
import {
  canonicalContent,
  changedSince,
  signedAtLabel,
  signedContent,
} from '../lib/order-signatures.ts';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const order = {
  code: 'OS-12',
  customer: ' Ana Souza ',
  device: 'iPhone 11',
  problem: 'Tela quebrada',
  service: 'Troca de tela',
  total: 350,
};
const signature = (extra = {}) => ({
  role: 'customer',
  signerName: 'Ana Souza',
  signedAt: '2026-10-19T17:32:00.000Z',
  image: PNG,
  changed: [],
  ...extra,
});

test('the signed content is a fixed copy of the order and the shop terms', () => {
  const content = signedContent(order, { terms: 'Garantia de 90 dias.' });
  assert.deepEqual(content, {
    code: 'OS-12',
    customer: 'Ana Souza',
    device: 'iPhone 11',
    problem: 'Tela quebrada',
    service: 'Troca de tela',
    total: 350,
    terms: 'Garantia de 90 dias.',
  });
  // A mesma OS dá sempre o mesmo texto (e o mesmo hash), seja qual for a ordem das chaves.
  const shuffled = Object.fromEntries(Object.entries(content).reverse());
  assert.equal(canonicalContent(shuffled), canonicalContent(content));
});

test('only entry data counts as a change after signing', () => {
  const signed = signedContent(order, { terms: 'Garantia de 90 dias.' });
  const later = signedContent(
    { ...order, service: 'Troca de tela e bateria', total: 520 },
    { terms: 'Garantia de 90 dias.' },
  );
  assert.deepEqual(changedSince(signed, later), [], 'serviço e valor mudam depois do diagnóstico');
  const edited = signedContent(
    { ...order, device: 'iPhone 12', problem: 'Não liga' },
    { terms: 'Garantia de 30 dias.' },
  );
  assert.deepEqual(changedSince(signed, edited), ['aparelho', 'problema relatado', 'termos']);
});

test('dates read in São Paulo time', () => {
  assert.equal(signedAtLabel('2026-10-19T17:32:00.000Z'), '19/10/2026 às 14:32');
  assert.equal(signatureNote(signature()), 'Assinado na tela em 19/10/2026 às 14:32.');
  assert.equal(
    signatureNote(signature({ changed: ['aparelho'] })),
    'Assinado na tela em 19/10/2026 às 14:32, antes de mudanças em: aparelho.',
  );
});

test('the print shows the signature over the line, or a blank line for paper', () => {
  const signed = renderToStaticMarkup(
    createElement(PrintSignature, {
      label: 'Assinatura do cliente',
      name: 'Ana',
      signature: signature(),
    }),
  );
  assert.match(
    signed,
    /<img alt="Assinatura do cliente de Ana Souza"[^>]*src="data:image\/png;base64,/,
  );
  assert.match(
    text(signed),
    /Assinatura do cliente Ana Souza Assinado na tela em 19\/10\/2026 às 14:32\./,
  );

  const blank = renderToStaticMarkup(
    createElement(PrintSignature, { label: 'Assinatura do cliente', name: 'Ana' }),
  );
  assert.doesNotMatch(blank, /<img|Assinado na tela/);
  assert.match(text(blank), /Assinatura do cliente Ana/);

  const compact = renderToStaticMarkup(
    createElement(PrintSignature, {
      compact: true,
      label: 'Assinatura do cliente',
      name: 'Ana',
      signature: signature(),
    }),
  );
  assert.match(compact, /class="compact-signature-image"/);
  assert.match(compact, /class="compact-signature-line">Assinatura do cliente</);
});

test('the full print carries both signatures in every copy', () => {
  const html = renderToStaticMarkup(
    createElement(FullOrderPrint, {
      data: { ...order, technician: 'João' },
      photos: [],
      copies: 2,
      issuedAt: '2026-10-19T17:40:00.000Z',
      signatures: [signature(), signature({ role: 'shop', signerName: 'João' })],
    }),
  );
  assert.equal((html.match(/src="data:image\/png;base64,/g) || []).length, 4);
  assert.match(text(html), /Assinatura da assistência João Assinado na tela/);
});

test('the order card says who signed, warns about later changes and offers to sign', () => {
  const html = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(OrderSignatures, {
        initialSignatures: [signature({ changed: ['aparelho'] })],
        order: { id: 'order-1', code: 'OS-12', customer: 'Ana Souza', device: 'iPhone 11' },
      }),
    ),
  );
  const page = text(html);
  assert.match(
    page,
    /Cliente .*Ana Souza, 19\/10\/2026 às 14:32 Mudou depois de assinar: aparelho\. Assinar de novo Remover/,
  );
  assert.match(page, /Assistência Ainda não assinada\. Assinar na tela/);
});
