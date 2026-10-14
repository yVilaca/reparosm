import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDeviceReport,
  applyPatch,
  checklistSummary,
  checks,
  deviceCheckKeys,
  emptyChecklist,
  parseDeviceReport,
  parsePatch,
  readChecklist,
} from '../lib/order-checklist.ts';

const AT = '2026-10-14T13:00:00.000Z';

test('the catalog has unique keys and only browser-testable checks go to the device', () => {
  assert.equal(new Set(checks.map((check) => check.key)).size, checks.length);
  assert.deepEqual(deviceCheckKeys, [
    'touch',
    'display',
    'rear-camera',
    'front-camera',
    'flash',
    'speaker',
    'microphone',
    'charging',
    'motion',
    'vibration',
  ]);
});

test('what is stored is read back without anything outside the format', () => {
  const read = readChecklist({
    powersOn: true,
    items: {
      touch: { state: 'ok', by: 'device', at: AT },
      buttons: { state: 'fail', note: '  volume + travado ', by: 'shop', at: AT },
      teleporte: { state: 'ok' },
      wifi: { state: 'talvez' },
    },
    marks: [
      { id: 'm1', side: 'front', x: 0.2, y: 0.3, kind: 'crack' },
      { id: 'm2', side: 'lado', x: 0.2, y: 0.3, kind: 'crack' },
      { id: 'm3', side: 'back', x: 2, y: 0.3, kind: 'dent' },
    ],
    notes: '',
    hacker: true,
  });
  assert.deepEqual(read, {
    powersOn: true,
    items: {
      touch: { state: 'ok', by: 'device', at: AT },
      buttons: { state: 'fail', note: 'volume + travado', by: 'shop', at: AT },
    },
    marks: [{ id: 'm1', side: 'front', x: 0.2, y: 0.3, kind: 'crack' }],
  });
  assert.deepEqual(readChecklist(null), emptyChecklist());
});

test('a shop change outside the closed list is refused whole', () => {
  for (const bad of [
    null,
    [],
    { outro: 1 },
    { items: { teleporte: { state: 'ok' } } },
    { items: { touch: { state: 'quase' } } },
    { items: { touch: { state: 'ok', note: 5 } } },
    { powersOn: 'sim' },
    { marks: [{ id: 'a', side: 'front', x: -0.1, y: 0.5, kind: 'crack' }] },
    { marks: [{ id: 'a b', side: 'front', x: 0.1, y: 0.5, kind: 'crack' }] },
    {
      marks: [
        { id: 'a', side: 'front', x: 0.1, y: 0.5, kind: 'crack' },
        { id: 'a', side: 'back', x: 0.1, y: 0.5, kind: 'dent' },
      ],
    },
    {
      marks: Array.from({ length: 41 }, (_, i) => ({
        id: `m${i}`,
        side: 'front',
        x: 0,
        y: 0,
        kind: 'other',
      })),
    },
    { notes: 'x'.repeat(1001) },
    { completed: 'sim' },
  ])
    assert.equal(parsePatch(bad), null, JSON.stringify(bad)?.slice(0, 60));
  assert.deepEqual(
    parsePatch({ items: { touch: { state: 'fail', note: '  canto  ' }, wifi: null } }),
    {
      items: { touch: { state: 'fail', note: 'canto' }, wifi: null },
    },
  );
});

test('the shop answers, clears, completes and reopens', () => {
  let list = applyPatch(
    emptyChecklist(),
    {
      powersOn: true,
      items: { touch: { state: 'ok' }, wifi: { state: 'fail', note: 'não acha rede' } },
    },
    AT,
  );
  assert.deepEqual(list.items.wifi, { state: 'fail', note: 'não acha rede', by: 'shop', at: AT });
  list = applyPatch(
    list,
    { items: { wifi: null }, notes: '  película trincada  ', completed: true },
    AT,
  );
  assert.equal(list.items.wifi, undefined);
  assert.equal(list.notes, 'película trincada');
  assert.equal(list.completedAt, AT);
  list = applyPatch(list, { notes: '   ', completed: false, powersOn: null }, AT);
  assert.equal(list.notes, undefined);
  assert.equal(list.completedAt, undefined);
  assert.equal(list.powersOn, undefined);
  assert.deepEqual(list.items.touch, { state: 'ok', by: 'shop', at: AT });
});

test('the device sends only what a browser can test, and only works or fails', () => {
  assert.equal(parseDeviceReport({ results: [{ key: 'buttons', state: 'ok' }] }), null);
  assert.equal(parseDeviceReport({ results: [{ key: 'touch', state: 'skip' }] }), null);
  assert.equal(parseDeviceReport({ results: 'tudo ok' }), null);
  assert.equal(parseDeviceReport({ results: [] }), null, 'nada para gravar');
  assert.deepEqual(
    parseDeviceReport({
      results: [{ key: 'touch', state: 'fail', note: 'sem resposta em 3 de 60 áreas' }],
      device: { platform: 'Android 14', screen: '1080×2400', battery: 81, extra: 'x' },
    }),
    {
      results: [{ key: 'touch', state: 'fail', note: 'sem resposta em 3 de 60 áreas' }],
      device: { platform: 'Android 14', screen: '1080×2400', battery: 81 },
    },
  );
  assert.deepEqual(parseDeviceReport({ device: { battery: 101, screen: 'x' } }), {
    results: [],
    device: { screen: 'x' },
  });
});

test('the device never overwrites what the shop answered by hand', () => {
  const shop = applyPatch(
    emptyChecklist(),
    { items: { speaker: { state: 'fail', note: 'chiando' } } },
    AT,
  );
  const later = '2026-10-14T13:05:00.000Z';
  const list = applyDeviceReport(
    shop,
    {
      results: [
        { key: 'speaker', state: 'ok' },
        { key: 'touch', state: 'ok' },
      ],
      device: { platform: 'iOS 18' },
    },
    later,
  );
  assert.deepEqual(list.items.speaker, { state: 'fail', note: 'chiando', by: 'shop', at: AT });
  assert.deepEqual(list.items.touch, { state: 'ok', by: 'device', at: later });
  assert.equal(list.powersOn, true, 'se o aparelho testou, ele liga');
  assert.deepEqual(list.device, { platform: 'iOS 18', at: later });
  const again = applyDeviceReport(list, { results: [{ key: 'touch', state: 'fail' }] }, later);
  assert.equal(
    again.items.touch.state,
    'fail',
    'resultado do aparelho pode ser refeito pelo aparelho',
  );
  const off = applyDeviceReport(
    { ...emptyChecklist(), powersOn: false },
    { results: [{ key: 'touch', state: 'ok' }] },
    later,
  );
  assert.equal(off.powersOn, false, 'a resposta da loja sobre ligar não muda');
});

test('the summary says what matters in one sentence', () => {
  assert.deepEqual(
    { status: checklistSummary(null).status, text: checklistSummary(null).text },
    { status: 'empty', text: 'Nenhum teste feito ainda.' },
  );
  const defects = applyPatch(
    emptyChecklist(),
    {
      items: {
        'rear-camera': { state: 'fail' },
        microphone: { state: 'fail' },
        touch: { state: 'ok' },
        wifi: { state: 'skip' },
      },
      marks: [{ id: 'm1', side: 'back', x: 0.5, y: 0.5, kind: 'scratch' }],
    },
    AT,
  );
  const summary = checklistSummary(defects);
  assert.equal(summary.text, '2 defeitos: Câmera traseira, Microfone. 1 avaria marcada.');
  assert.deepEqual(
    [summary.status, summary.answered, summary.ok, summary.fail, summary.skip],
    ['partial', 4, 1, 2, 1],
  );
  const allOk = applyPatch(
    emptyChecklist(),
    {
      items: Object.fromEntries(checks.map((check) => [check.key, { state: 'ok' }])),
      completed: true,
    },
    AT,
  );
  assert.equal(checklistSummary(allOk).text, 'Tudo funcionando. Nenhuma avaria marcada.');
  assert.equal(checklistSummary(allOk).status, 'done');
  const some = applyPatch(emptyChecklist(), { items: { touch: { state: 'ok' } } }, AT);
  assert.equal(
    checklistSummary(some).text,
    `1 de ${checks.length} testados, sem defeito. Nenhuma avaria marcada.`,
  );
  const off = applyPatch(
    defects,
    {
      powersOn: false,
      marks: [
        { id: 'm1', side: 'front', x: 0.5, y: 0.5, kind: 'crack' },
        { id: 'm2', side: 'back', x: 0.5, y: 0.5, kind: 'dent' },
      ],
    },
    AT,
  );
  const offSummary = checklistSummary(off);
  assert.equal(
    offSummary.text,
    'O aparelho não liga: sem testes de funcionamento. 2 avarias marcadas.',
  );
  assert.deepEqual([offSummary.answered, offSummary.fail, offSummary.defects], [0, 0, []]);
});
