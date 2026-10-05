import assert from 'node:assert/strict';
import test from 'node:test';
import { orderStages, normalizeOrderStage } from '../lib/order-stages.ts';

test('uses the five service stages in the requested order', () => {
  assert.deepEqual(orderStages, [
    'Recebido',
    'Aguardando Peça',
    'Em serviço',
    'Retirada',
    'Concluído',
  ]);
  for (const stage of orderStages) assert.equal(normalizeOrderStage(stage), stage);
});

test('keeps old orders visible in the new workflow', () => {
  assert.equal(normalizeOrderStage('Diagnóstico'), 'Em serviço');
  assert.equal(normalizeOrderStage('Em reparo'), 'Em serviço');
  assert.equal(normalizeOrderStage('Teste final'), 'Em serviço');
  assert.equal(normalizeOrderStage('Aguardando aprovação'), 'Aguardando Peça');
  assert.equal(normalizeOrderStage(undefined), 'Recebido');
});
