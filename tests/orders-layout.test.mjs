import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OrderPaymentStatus from '../components/order-payment-status.tsx';
import OrdersRoute, { edgeScrollSpeed, matchesOrderFilters } from '../components/orders-route.tsx';
import Filters from '../components/ui/filters.tsx';
import OrdersTable from '../components/orders-table.tsx';
import { FeedbackProvider } from '../components/feedback.tsx';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const renderScreen = (component, props) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { refresh() {} } },
      createElement(FeedbackProvider, null, createElement(component, props)),
    ),
  );

test('Mesa scrolls only near its edges, with speed increasing toward the border', () => {
  assert.equal(edgeScrollSpeed(0, 1000), -480);
  assert.equal(edgeScrollSpeed(50, 1000), -240);
  assert.ok(edgeScrollSpeed(80, 1000) < 0);
  assert.equal(edgeScrollSpeed(100, 1000), 0);
  assert.equal(edgeScrollSpeed(500, 1000), 0);
  assert.equal(edgeScrollSpeed(900, 1000), 0);
  assert.ok(edgeScrollSpeed(920, 1000) > 0);
  assert.equal(edgeScrollSpeed(950, 1000), 240);
  assert.equal(edgeScrollSpeed(1000, 1000), 480);
  assert.equal(edgeScrollSpeed(-1, 1000), 0);
  assert.equal(edgeScrollSpeed(1001, 1000), 0);
  assert.equal(edgeScrollSpeed(0, 0), 0);
  assert.equal(edgeScrollSpeed(10, 20), 0);
});

test('the list and Mesa are separate screens with links to each other and order details', () => {
  const initialOrders = [{ id: 'order-1', code: 'OS-12', customer: 'Ana', device: 'iPhone' }];
  const list = renderScreen(OrdersRoute, { initialOrders, view: 'grid' });
  assert.match(list, /href="\/mesa"/);
  assert.match(list, /aria-label="Ver OS OS-12"/);
  assert.match(list, /<table/);
  assert.doesNotMatch(list, /aria-label="Etapa Recebido"/);
  assert.doesNotMatch(list, /Visualização das ordens/);

  const mesa = renderScreen(OrdersRoute, { initialOrders, view: 'kanban' });
  assert.match(mesa, /<h1[^>]*>Mesa<\/h1>/);
  assert.match(mesa, /href="\/ordens"/);
  // O código aparece como etiqueta; o código inteiro fica para leitores de tela.
  assert.match(
    mesa,
    /aria-label="Ver OS OS-12"[^>]*>(?:(?!<\/button>)[\s\S])*>OS-12<[\s\S]*?<\/button>/,
  );
  // O cartão abre a ficha: nenhum botão "Ver OS" repetido.
  assert.doesNotMatch(mesa, />Ver OS</);
  assert.match(mesa, /aria-label="Etapa Recebido"/);
  assert.doesNotMatch(mesa, /<table/);
  assert.doesNotMatch(mesa, /Visualização das ordens/);
});

test('order list offers the kanban stages on desktop and mobile and locks them while saving', () => {
  const stages = ['Recebido', 'Aguardando Peça', 'Em serviço', 'Retirada', 'Concluído'];
  const props = {
    orders: [{ id: 'order-1', code: 'OS-12', customer: 'Ana', stage: 'Em serviço' }],
    selectedIds: new Set(),
    setSelectedIds() {},
    stages,
    onStageChange() {},
  };
  const render = (value) =>
    renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider,
        { value: { refresh() {} } },
        createElement(FeedbackProvider, null, createElement(OrdersTable, value)),
      ),
    );
  const html = render(props);
  const triggers = html.match(/<button\b(?=[^>]*data-slot="select-trigger")[^>]*>/g) || [];
  assert.equal(triggers.length, 2);
  for (const trigger of triggers) {
    assert.match(trigger, /aria-label="Etapa da ordem OS-12: Em serviço\. Alterar"/);
    assert.match(trigger, /data-size="sm"/);
    assert.doesNotMatch(trigger, / disabled=""/);
  }
  const saving = render({ ...props, changingStage: true });
  assert.equal(
    (saving.match(/<button\b(?=[^>]*data-slot="select-trigger")(?=[^>]*disabled="")[^>]*>/g) || [])
      .length,
    2,
  );
});

test('the order itself opens its details, without a repeated "Ver OS" button', () => {
  const html = renderScreen(OrdersTable, {
    orders: [{ id: 'order-1', code: 'OS-12', customer: 'Ana' }],
    selectedIds: new Set(),
    setSelectedIds() {},
    onView() {},
    onEdit() {},
  });
  // O número da OS é o botão que abre a ficha, na tabela e no cartão do celular.
  const openers =
    html.match(/<button\b[^>]*aria-label="Ver OS OS-12"[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(openers.length, 2);
  for (const opener of openers) assert.match(opener, />OS-12</);
  assert.doesNotMatch(html, />Ver OS</);
  // A linha toda é clicável e mostra a seta de "abrir".
  assert.match(html, /<tr\b[^>]*cursor-pointer/);
  assert.match(html, /lucide-chevron-right/);
  // Selecionar continua separado de abrir.
  assert.match(html, /aria-label="Selecionar ordem OS-12"/);
});

test('without a way to open the order, the code is plain text', () => {
  const html = renderScreen(OrdersTable, {
    orders: [{ id: 'order-1', code: 'OS-12', customer: 'Ana' }],
    selectedIds: new Set(),
    setSelectedIds() {},
  });
  assert.doesNotMatch(html, /aria-label="Ver OS OS-12"/);
  assert.doesNotMatch(html, /<tr\b[^>]*cursor-pointer/);
});

test('combines field filters and preserves the general order search', () => {
  const order = { code: 'OS-12', customer: 'Ana Silva', device: 'iPhone', phone: '11987654321' };
  assert.equal(
    matchesOrderFilters(order, [
      { field: 'customer', value: ' ANA ' },
      { field: 'device', value: 'iphone' },
      { field: 'stage', value: 'Recebido' },
      { field: 'priority', value: 'Normal' },
    ]),
    true,
  );
  assert.equal(matchesOrderFilters(order, [{ field: 'stage', value: 'Em reparo' }]), false);
  assert.equal(matchesOrderFilters(order, [{ field: 'customer', value: 'iPhone' }]), false);
  assert.equal(matchesOrderFilters(order, [{ field: 'search', value: 'OS-12' }]), true);
  assert.equal(matchesOrderFilters(order, []), true);
});

test('active filters expose compact removable badges', () => {
  const html = renderToStaticMarkup(
    createElement(Filters, {
      fields: [{ key: 'customer', label: 'Cliente' }],
      value: [{ field: 'customer', value: 'Ana' }],
      onChange() {},
    }),
  );
  assert.match(html, /Cliente: Ana/);
  assert.match(html, /aria-label="Remover filtro Cliente: Ana"/);
  assert.match(html, /title="Clique para remover este filtro"/);
});

test('filter choices use the custom select popover instead of native menus', async () => {
  const source = await readFile(new URL('../components/ui/filters.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<select\b/g) || []).length, 0);
  assert.equal((source.match(/<SelectTrigger\b/g) || []).length, 2);
  assert.match(source, /<SelectContent[^>]*position="popper"/g);
});

test('unpaid cards offer an accessible icon without redundant payment text', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, { order: { total: 100 }, onCharge() {} }),
  );
  assert.doesNotMatch(html, /Pagamento pendente/);
  assert.match(html, /aria-label="Registrar recebimento"/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, />Registrar recebimento</);
});

test('paid cards keep the receipt amount and do not offer another receipt', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, { order: { total: 100, payment: { value: 80 } } }),
  );
  assert.match(html, /Recebido/);
  assert.match(html, /80,00/);
  assert.doesNotMatch(html, /<button/);
});
