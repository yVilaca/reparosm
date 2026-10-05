import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clientStatusTone,
  isNotablePriority,
  orderPriorityTone,
  orderStageTone,
  quoteStatusTone,
  stockTone,
  warrantyStatusTone,
} from '../lib/status-tones.ts';

test('the same meaning gets the same color on every screen', () => {
  // Em andamento é azul, esperando alguém é âmbar, pronto é verde.
  assert.equal(orderStageTone('Em serviço'), 'info');
  assert.equal(clientStatusTone('Em atendimento'), 'info');
  assert.equal(orderStageTone('Aguardando Peça'), 'warning');
  assert.equal(quoteStatusTone('Aguardando'), 'warning');
  assert.equal(clientStatusTone('Aguardando'), 'warning');
  assert.equal(orderStageTone('Retirada'), 'success');
  assert.equal(orderStageTone('Concluído'), 'success');
  assert.equal(quoteStatusTone('Aprovado'), 'success');
  assert.equal(clientStatusTone('Concluído'), 'success');
  assert.equal(warrantyStatusTone('active'), 'success');
  // Problema é vermelho.
  assert.equal(orderPriorityTone('Urgente'), 'danger');
  assert.equal(quoteStatusTone('Recusado'), 'danger');
  assert.equal(warrantyStatusTone('expired'), 'danger');
  // Novo ou normal fica neutro, nunca roxo.
  assert.equal(orderStageTone('Recebido'), 'neutral');
  assert.equal(clientStatusTone('Novo'), 'neutral');
  assert.equal(orderPriorityTone('Normal'), 'neutral');
});

test('only priorities out of the ordinary become a label', () => {
  assert.equal(isNotablePriority('Urgente'), true);
  assert.equal(isNotablePriority('Garantia'), true);
  assert.equal(isNotablePriority('Normal'), false);
  assert.equal(isNotablePriority(undefined), false);
});

test('stock is a problem at zero and needs attention when low', () => {
  assert.equal(stockTone(0), 'danger');
  assert.equal(stockTone(3), 'warning');
  assert.equal(stockTone(4, 4), 'warning');
  assert.equal(stockTone(5, 4), 'success');
});
