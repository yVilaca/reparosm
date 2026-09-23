import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMoney,
  hasValidWhatsapp,
  normalizePhone,
  whatsappPhone,
  whatsappUrl,
} from '../lib/format.ts';

test('normalizes Brazilian phone numbers and adds the country code once', () => {
  assert.equal(normalizePhone('(11) 99999-8888'), '11999998888');
  assert.equal(whatsappPhone('(11) 99999-8888'), '5511999998888');
  assert.equal(whatsappPhone('5511999998888'), '5511999998888');
  assert.equal(hasValidWhatsapp('123'), false);
  assert.equal(hasValidWhatsapp('(11) 99999-8888'), true);
});

test('builds an encoded WhatsApp URL', () => {
  assert.match(whatsappUrl('11999998888', 'Olá mundo'), /^https:\/\/wa\.me\/5511999998888\?text=/);
});

test('formats Brazilian currency', () => {
  assert.match(formatMoney(1234.5), /^R\$\s1\.234,50$/);
});
