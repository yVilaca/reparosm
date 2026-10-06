import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatCurrencyInput,
  formatCurrencyOrPercentInput,
  formatDocumentInput,
  formatIntegerInput,
  formatPhoneInput,
  formatSignedIntegerInput,
} from '../lib/input-masks.ts';

test('formats Brazilian phone numbers while preserving partial input', () => {
  assert.equal(formatPhoneInput(''), '');
  assert.equal(formatPhoneInput('11'), '(11');
  assert.equal(formatPhoneInput('1198765'), '(11) 98765');
  assert.equal(formatPhoneInput('1198765432'), '(11) 9876-5432');
  assert.equal(formatPhoneInput('11987654321'), '(11) 98765-4321');
  assert.equal(formatPhoneInput('(11) 98765-4321'), '(11) 98765-4321');
  assert.equal(formatPhoneInput('11987654321999'), '(11) 98765-4321');
});

test('formats CPF and CNPJ from the same document field', () => {
  assert.equal(formatDocumentInput('12345678901'), '123.456.789-01');
  assert.equal(formatDocumentInput('12345678000199'), '12.345.678/0001-99');
  assert.equal(formatDocumentInput('12.345.678/0001-99'), '12.345.678/0001-99');
});

test('formats Brazilian currency without losing a typed decimal separator', () => {
  assert.equal(formatCurrencyInput(''), '');
  assert.equal(formatCurrencyInput('25'), '25');
  assert.equal(formatCurrencyInput('25,'), '25,');
  assert.equal(formatCurrencyInput('1234,56'), '1.234,56');
  assert.equal(formatCurrencyInput('R$ 1.234,56'), '1.234,56');
});

test('formats discounts as currency or percentage and keeps quantities numeric', () => {
  assert.equal(formatCurrencyOrPercentInput('10'), '10');
  assert.equal(formatCurrencyOrPercentInput('10,5%'), '10,5%');
  assert.equal(formatCurrencyOrPercentInput('R$ 1.234,56'), '1.234,56');
  assert.equal(formatIntegerInput('12abc.3'), '123');
});

test('formats signed integer input', () => {
  assert.equal(formatSignedIntegerInput('-12abc.3'), '-123');
  assert.equal(formatSignedIntegerInput('12abc.3'), '123');
});
