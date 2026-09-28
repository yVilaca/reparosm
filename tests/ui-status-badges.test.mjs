import assert from 'node:assert/strict';
import test from 'node:test';
import * as ordersTable from '../components/orders-table.tsx';
import * as clientsRoute from '../components/clients-route.tsx';

test('order stages map to clear badge variants', () => {
  assert.equal(ordersTable.orderStageVariant('Retirada'), 'success');
  assert.equal(ordersTable.orderStageVariant('Aguardando aprovação'), 'warning');
  assert.equal(ordersTable.orderStageVariant('Etapa desconhecida'), 'secondary');
});

test('order priorities map to readable badge variants', () => {
  assert.equal(ordersTable.orderPriorityVariant('Urgente'), 'destructive');
  assert.equal(ordersTable.orderPriorityVariant('Garantia'), 'warning');
  assert.equal(ordersTable.orderPriorityVariant('Normal'), 'secondary');
  assert.equal(ordersTable.orderPriorityVariant('Prioridade futura'), 'secondary');
});

test('client statuses map to clear badge variants', () => {
  assert.equal(clientsRoute.clientStatusVariant('Em atendimento'), 'default');
  assert.equal(clientsRoute.clientStatusVariant('Concluído'), 'success');
  assert.equal(clientsRoute.clientStatusVariant('Aguardando'), 'warning');
  assert.equal(clientsRoute.clientStatusVariant('Status desconhecido'), 'secondary');
});
