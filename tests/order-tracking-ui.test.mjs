import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import { OrderDetails } from '../components/order-details-dialog.tsx';
import OrderTrackingPanel from '../components/order-tracking-panel.tsx';
import TrackingView from '../components/tracking-view.tsx';

const now = new Date('2026-10-10T20:00:00.000Z'); // 17:00 em São Paulo
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const view = (order = {}, shop = {}, events) =>
  renderToStaticMarkup(
    createElement(TrackingView, {
      now,
      tracking: {
        shop: {
          name: 'Loja do Zé',
          phone: '11988887777',
          address: 'Rua A, 10',
          hours: 'Seg a sáb, 9h às 18h',
          ...shop,
        },
        order: {
          code: 'OS-12',
          firstName: 'Ana',
          device: 'iPhone 11',
          problem: 'Tela quebrada',
          service: 'Troca de tela',
          stage: 'Retirada',
          status: 'Aberto',
          createdAt: '2026-10-08T19:20:00.000Z',
          total: 350,
          paid: 100,
          ...order,
        },
        events: events ?? [
          { stage: 'Recebido', status: 'Aberto', at: '2026-10-08T19:20:01.000Z' },
          { stage: 'Em serviço', status: 'Aberto', at: '2026-10-09T13:05:00.000Z' },
          { stage: 'Retirada', status: 'Aberto', at: '2026-10-10T17:32:00.000Z' },
        ],
      },
    }),
  );

test('ready to collect: status first, what is due, how to reach the shop', () => {
  const html = view();
  const page = text(html);
  assert.match(page, /Loja do Zé Acompanhamento do serviço/);
  assert.match(page, /Olá, Ana\. Seu iPhone 11/);
  assert.match(page, /Pronto para retirada Pode vir buscar\. Informe o número OS-12 no balcão\./);
  assert.match(html, /<li aria-current="step"[^>]*>.*?Pronto</);
  assert.match(page, /Atualizado hoje às 14:32/);
  assert.match(page, /A pagar na retirada Já pago R\$\s*100,00 de R\$\s*350,00 R\$\s*250,00/);
  assert.match(html, /href="https:\/\/wa\.me\/5511988887777\?text=[^"]*OS-12/);
  assert.match(html, /href="tel:11988887777"/);
  assert.match(
    html,
    /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Rua%20A%2C%2010"/,
  );
  assert.match(
    page,
    /Linha do tempo Pronto para retirada hoje às 14:32 Em reparo ontem às 10:05 Recebemos seu aparelho 08\/10 às 16:20/,
  );
  assert.match(
    page,
    /Aparelho iPhone 11 Problema Tela quebrada Serviço Troca de tela Valor R\$\s*350,00/,
  );
  assert.match(page, /Onde retirar Rua A, 10 Seg a sáb, 9h às 18h/);
  assert.match(page, /não permite alterar nada/);
});

test('paid, delivered with warranty, cancelled and no price yet', () => {
  assert.match(text(view({ paid: 350 })), /Pago R\$\s*350,00/);

  const delivered = text(
    view({ stage: 'Concluído', status: 'Concluído', paid: 350, warrantyUntil: '2027-01-08' }),
  );
  assert.match(delivered, /Entregue Aparelho entregue\. A garantia vale até 08\/01\/2027\./);
  assert.match(delivered, /Garantia Até 08\/01\/2027/);

  const cancelled = view({ status: 'Cancelado' });
  assert.match(text(cancelled), /Serviço cancelado Este serviço foi cancelado/);
  assert.doesNotMatch(cancelled, /Etapas do serviço|aria-label="Pagamento"/);
  assert.match(text(cancelled), /Valor Sem cobrança/);

  const unpriced = view({ stage: 'Recebido', total: 0, paid: 0 }, {}, []);
  assert.match(text(unpriced), /Recebemos seu aparelho Ele está na fila para avaliação\./);
  assert.match(text(unpriced), /Valor A loja informa o valor/);
  assert.doesNotMatch(unpriced, /aria-label="Pagamento"/);
});

test('without phone, address or logo the page still stands', () => {
  const html = view({}, { phone: undefined, address: undefined, hours: undefined });
  assert.doesNotMatch(html, /Falar com a loja|Onde retirar/);
  assert.match(html, />L<\/span>/, 'inicial da loja no lugar da logo');
  assert.match(
    view({}, { logoUrl: '/api/public/shops/logo?loja=x&v=1' }),
    /<img[^>]+src="\/api\/public\/shops\/logo\?loja=x&amp;v=1"/,
  );
});

test('the shop panel shows what happened and offers to send, copy or turn off', () => {
  const panel = (initialSummary) =>
    renderToStaticMarkup(
      createElement(
        FeedbackProvider,
        null,
        createElement(OrderTrackingPanel, {
          order: { id: 'order-1', code: 'OS-12', customer: 'Ana', device: 'iPhone 11' },
          initialSummary,
        }),
      ),
    );
  const fresh = text(panel({ active: 0, views: 0 }));
  assert.match(fresh, /Acompanhamento do cliente/);
  assert.match(fresh, /Nenhum link enviado ainda\. Enviar no WhatsApp Copiar link/);
  assert.doesNotMatch(fresh, /Desativar links/);
  assert.match(
    text(
      panel({
        active: 1,
        views: 2,
        lastSentAt: new Date().toISOString(),
        lastViewedAt: new Date().toISOString(),
      }),
    ),
    /Cliente abriu hoje às \d{2}:\d{2} \(2 visitas\)\..*Desativar links/,
  );

  const details = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(OrderDetails, {
        order: {
          id: 'order-1',
          code: 'OS-12',
          customer: 'Ana',
          device: 'iPhone 11',
          stage: 'Recebido',
        },
      }),
    ),
  );
  assert.match(
    text(details),
    /Situação da ordem.*Acompanhamento do cliente.*Valores e recebimento/,
  );
});
