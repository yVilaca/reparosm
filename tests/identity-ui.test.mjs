import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RefTag from '../components/ui/ref-tag.tsx';
import { StageSteps, StageTrack, stagePosition } from '../components/ui/stage-track.tsx';

const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const filled = (html) => (html.match(/rounded-full bg-(?!foreground\/12)/g) || []).length;

test('the stage track fills the bench path up to the current stage', () => {
  assert.equal(stagePosition('Recebido'), 1);
  assert.equal(stagePosition('Em serviço'), 3);
  assert.equal(stagePosition('Concluído'), 5);
  // Etapas antigas caem na etapa atual do fluxo.
  assert.equal(stagePosition('Em reparo'), 3);
  assert.equal(stagePosition(undefined), 1);

  const html = render(StageTrack, { stage: 'Aguardando Peça' });
  assert.match(html, /aria-hidden="true"/);
  assert.equal((html.match(/h-3 w-\[3px\]/g) || []).length, 5);
  assert.equal(filled(html), 2);
  // A cor é a do tom da etapa: esperando peça é âmbar.
  assert.match(html, /bg-amber-500/);
});

test('the order record names every stage and marks where the device is', () => {
  const html = render(StageSteps, { stage: 'Retirada' });
  assert.match(html, /<ol aria-label="Etapas da OS"/);
  for (const stage of ['Recebido', 'Aguardando Peça', 'Em serviço', 'Retirada', 'Concluído'])
    assert.match(html, new RegExp(`>${stage}<`));
  assert.match(html, /<li aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*>Retirada</);
  assert.equal((html.match(/aria-current/g) || []).length, 1);
  assert.equal(filled(html), 4);
});

test('a record code reads as a tag but is announced whole', () => {
  const html = render(RefTag, { code: 'OS-50' });
  assert.match(html, /<span class="sr-only">OS-50<\/span>/);
  assert.match(html, /aria-hidden="true"[^>]*>OS</);
  assert.match(html, /aria-hidden="true"[^>]*>50</);
  assert.match(html, /border-dashed/);
  // Sem o formato TIPO-NÚMERO, mostra o código como veio.
  assert.match(render(RefTag, { code: 'avulsa' }), />avulsa</);
});
