import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  billSuggestions,
  cashChange,
  frequentSales,
  matchProducts,
  parseDiscount,
  parseMoney,
  saleTotals,
} from '../lib/quick-sale.ts';

test('reads money the way people type it in Brazil', () => {
  assert.equal(parseMoney('25'), 25);
  assert.equal(parseMoney('25,9'), 25.9);
  assert.equal(parseMoney('25,90'), 25.9);
  assert.equal(parseMoney('R$ 1.234,56'), 1234.56);
  assert.equal(parseMoney('1.234'), 1234);
  assert.equal(parseMoney('25.90'), 25.9);
  assert.ok(Number.isNaN(parseMoney('')));
  assert.ok(Number.isNaN(parseMoney('abc')));
  assert.ok(Number.isNaN(parseMoney('2,999')));
});

test('works out the change, or how much is still missing', () => {
  assert.deepEqual(cashChange(32.5, 50), { kind: 'change', amount: 17.5 });
  assert.deepEqual(cashChange(32.5, 32.5), { kind: 'change', amount: 0 });
  assert.deepEqual(cashChange(32.5, 20), { kind: 'short', amount: 12.5 });
  assert.equal(cashChange(32.5, Number.NaN), null);
  assert.equal(cashChange(Number.NaN, 50), null);
});

test('suggests the notes a customer is likely to hand over', () => {
  assert.deepEqual(billSuggestions(32.5), [40, 50, 100]);
  assert.deepEqual(billSuggestions(45), [50, 100]);
  assert.deepEqual(billSuggestions(100), [110, 150, 200]);
  assert.deepEqual(billSuggestions(Number.NaN), []);
});

test('offers the items sold most often, most recent first on ties', () => {
  const sales = [
    { description: 'Película 3D', value: 30, date: '2026-10-01' },
    { description: 'película 3d ', value: 30, date: '2026-10-03' },
    { description: 'Capinha', value: 45, date: '2026-10-02' },
    { description: 'Carregador', value: 60, date: '2026-10-03' },
    { description: 'Película 3D', value: 35, date: '2026-09-30' },
  ];
  assert.deepEqual(frequentSales(sales, 3), [
    { description: 'película 3d', value: 30 },
    { description: 'Carregador', value: 60 },
    { description: 'Capinha', value: 45 },
  ]);
});

const products = [
  {
    id: 'p1',
    name: 'Película 3D iPhone 15',
    category: 'Películas',
    price: 60,
    cost: 12,
    stock: 40,
  },
  {
    id: 'p2',
    name: 'Película de vidro Galaxy A54',
    category: 'Películas',
    price: 30,
    cost: 6,
    stock: 0,
  },
  { id: 'p3', name: 'Capinha anti-impacto', category: 'Capinhas', price: 45, cost: 15, stock: 25 },
  {
    id: 'p4',
    name: 'Carregador turbo 20W',
    category: 'Acessórios',
    sku: 'CRG-20',
    price: 60,
    stock: 4,
  },
];

test('finds products as you type, by name, category or code, ignoring accents', () => {
  assert.deepEqual(
    matchProducts(products, 'pelicula').map((product) => product.id),
    ['p1', 'p2'],
  );
  assert.deepEqual(
    matchProducts(products, 'pel 15').map((product) => product.id),
    ['p1'],
  );
  assert.deepEqual(
    matchProducts(products, 'acessorios').map((product) => product.id),
    ['p4'],
  );
  assert.deepEqual(
    matchProducts(products, 'crg').map((product) => product.id),
    ['p4'],
  );
  assert.deepEqual(matchProducts(products, '  '), []);
  assert.deepEqual(matchProducts(products, 'fone'), []);
});

test('puts names that start with the search first, then what is in stock', () => {
  const list = [
    { id: 'a', name: 'Cabo para carregador', price: 20, stock: 3 },
    { id: 'b', name: 'Carregador sem estoque', price: 50, stock: 0 },
    { id: 'c', name: 'Carregador turbo', price: 60, stock: 5 },
  ];
  assert.deepEqual(
    matchProducts(list, 'carreg').map((product) => product.id),
    ['c', 'b', 'a'],
  );
});

test('reads a discount in reais or as a percentage of the price', () => {
  assert.equal(parseDiscount('', 60), 0);
  assert.equal(parseDiscount('5', 60), 5);
  assert.equal(parseDiscount('5,50', 60), 5.5);
  assert.equal(parseDiscount('10%', 60), 6);
  assert.equal(parseDiscount('15 %', 33.33), 5);
  assert.ok(Number.isNaN(parseDiscount('120%', 60)));
  assert.ok(Number.isNaN(parseDiscount('abc', 60)));
});

test('works out what to receive and the profit of the sale', () => {
  assert.deepEqual(saleTotals(60, 6, 12), { total: 54, profit: 42, margin: 77.8 });
  assert.deepEqual(saleTotals(60, 0), { total: 60, profit: null, margin: null });
  assert.deepEqual(saleTotals(30, 0, 35), { total: 30, profit: -5, margin: -16.7 });
});
