import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountDue,
  relativeTime,
  trackingDetail,
  trackingMessage,
  trackingState,
  trackingTimeline,
  warrantyUntil,
} from '../lib/order-tracking.ts';
import { trackingStatus } from '../components/order-tracking-panel.tsx';

const tracking = (order = {}, events = []) => ({
  shop: { name: 'Loja do Zé' },
  order: {
    code: 'OS-12',
    firstName: 'Ana',
    device: 'iPhone 11',
    stage: 'Recebido',
    status: 'Aberto',
    createdAt: '2026-10-08T19:20:00.000Z',
    total: 0,
    paid: 0,
    ...order,
  },
  events,
});

test('each stage reads as the customer understands it; cancelled wins over the stage', () => {
  assert.deepEqual(
    ['Recebido', 'Aguardando Peça', 'Em serviço', 'Retirada', 'Concluído'].map((stage) => {
      const state = trackingState(stage, 'Aberto');
      return [state.title, state.tone, state.step];
    }),
    [
      ['Recebemos seu aparelho', 'neutral', 0],
      ['Aguardando peça', 'warning', 1],
      ['Em reparo', 'info', 1],
      ['Pronto para retirada', 'success', 2],
      ['Entregue', 'neutral', 3],
    ],
  );
  assert.equal(trackingState('Retirada', 'Cancelado').title, 'Serviço cancelado');
  // Etapas antigas seguem o fluxo atual.
  assert.equal(trackingState('Diagnóstico').title, 'Em reparo');
});

test('the timeline starts at check-in and keeps only changes the customer notices', () => {
  const items = trackingTimeline(
    tracking({ stage: 'Retirada', status: 'Aguardando pagamento' }, [
      { stage: 'Recebido', status: 'Aberto', at: '2026-10-08T19:20:01.000Z' },
      { stage: 'Em serviço', status: 'Aberto', at: '2026-10-09T13:05:00.000Z' },
      // Mudança só de cobrança: não aparece.
      { stage: 'Em serviço', status: 'Pendente', at: '2026-10-09T15:00:00.000Z' },
      { stage: 'Retirada', status: 'Aguardando pagamento', at: '2026-10-10T17:32:00.000Z' },
    ]),
  );
  assert.deepEqual(
    items.map((item) => [item.title, item.at, item.current]),
    [
      ['Recebemos seu aparelho', '2026-10-08T19:20:00.000Z', false],
      ['Em reparo', '2026-10-09T13:05:00.000Z', false],
      ['Pronto para retirada', '2026-10-10T17:32:00.000Z', true],
    ],
  );
});

test('an order from before the history shows check-in and the current state without a date', () => {
  const items = trackingTimeline(tracking({ stage: 'Em serviço' }));
  assert.deepEqual(
    items.map((item) => [item.title, item.at, item.current]),
    [
      ['Recebemos seu aparelho', '2026-10-08T19:20:00.000Z', false],
      ['Em reparo', undefined, true],
    ],
  );
});

test('warranty, amount due and the line under the status', () => {
  assert.equal(warrantyUntil('2026-10-10', 90), '2027-01-08');
  assert.equal(warrantyUntil('2026-10-10', 0), undefined);
  assert.equal(warrantyUntil(undefined, 90), undefined);

  assert.equal(amountDue(tracking({ total: 350, paid: 100 }).order), 250);
  assert.equal(amountDue(tracking({ total: 350, paid: 350 }).order), 0);
  assert.equal(amountDue(tracking({ total: 350, status: 'Cancelado' }).order), 0);

  assert.equal(
    trackingDetail(tracking({ stage: 'Retirada' })),
    'Pode vir buscar. Informe o número OS-12 no balcão.',
  );
  assert.equal(
    trackingDetail(tracking({ stage: 'Concluído', warrantyUntil: '2027-01-08' })),
    'Aparelho entregue. A garantia vale até 08/01/2027.',
  );
});

test('times read as today, yesterday or the date, in São Paulo time', () => {
  const now = new Date('2026-10-10T20:00:00.000Z'); // 17:00 em São Paulo
  assert.equal(relativeTime('2026-10-10T17:32:00.000Z', now), 'hoje às 14:32');
  assert.equal(relativeTime('2026-10-09T12:10:00.000Z', now), 'ontem às 09:10');
  assert.equal(relativeTime('2026-10-08T19:20:00.000Z', now), '08/10 às 16:20');
  assert.equal(relativeTime('2025-12-30T13:00:00.000Z', now), '30/12/2025 às 10:00');
  // 01:00 UTC do dia 10 ainda é dia 9 em São Paulo.
  assert.equal(relativeTime('2026-10-10T01:00:00.000Z', now), 'ontem às 22:00');
});

test('the WhatsApp message greets by first name and carries the link', () => {
  assert.equal(
    trackingMessage(
      { customer: 'Ana Maria Souza', code: 'OS-12', device: 'iPhone 11' },
      'https://app/acompanhar#t=x',
    ),
    'Olá, Ana! Acompanhe o serviço do seu iPhone 11 (OS-12) por este link: https://app/acompanhar#t=x',
  );
});

test('the shop sees in one sentence what happened to the links', () => {
  const now = new Date('2026-10-10T20:00:00.000Z');
  assert.equal(trackingStatus(null, now), 'Carregando…');
  assert.equal(trackingStatus({ active: 0, views: 0 }, now), 'Nenhum link enviado ainda.');
  assert.equal(
    trackingStatus({ active: 1, views: 0, lastSentAt: '2026-10-10T17:00:00.000Z' }, now),
    'Enviado hoje às 14:00, ainda não aberto.',
  );
  assert.equal(
    trackingStatus(
      {
        active: 2,
        views: 3,
        lastSentAt: '2026-10-09T17:00:00.000Z',
        lastViewedAt: '2026-10-10T17:32:00.000Z',
      },
      now,
    ),
    'Cliente abriu hoje às 14:32 (3 visitas).',
  );
  assert.equal(
    trackingStatus({ active: 0, views: 0, lastSentAt: '2026-10-09T17:00:00.000Z' }, now),
    'Links desativados.',
  );
});
