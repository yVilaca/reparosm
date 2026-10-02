import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMoney,
  hasValidWhatsapp,
  identifyingPhoneDigits,
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

test('only treats a real phone as a client identifier', () => {
  assert.equal(identifyingPhoneDigits('(11) 98888-7777'), '11988887777');
  assert.equal(identifyingPhoneDigits('1133334444'), '1133334444');
  // Sem telefone, curto demais ou placeholder digitado quando o campo era
  // obrigatório: nada disso identifica uma pessoa.
  assert.equal(identifyingPhoneDigits(''), '');
  assert.equal(identifyingPhoneDigits(undefined), '');
  assert.equal(identifyingPhoneDigits('98888777'), '');
  assert.equal(identifyingPhoneDigits('000000000000'), '');
  assert.equal(identifyingPhoneDigits('(11) 11111-1111'), '');
});
