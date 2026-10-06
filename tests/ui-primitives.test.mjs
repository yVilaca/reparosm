import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PageHeader from '../components/ui/page-header.tsx';
import EmptyState from '../components/ui/empty-state.tsx';

const badgeModule = await import('../components/ui/badge.tsx').catch(() => null);
const dialogModule = await import('../components/ui/dialog.tsx').catch(() => null);
const selectModule = await import('../components/ui/select.tsx').catch(() => null);
const tableModule = await import('../components/ui/table.tsx').catch(() => null);
const textareaModule = await import('../components/ui/textarea.tsx').catch(() => null);
const maskedInputModule = await import('../components/ui/masked-input.tsx').catch(() => null);

test('PageHeader renders title, description and action', () => {
  const html = renderToStaticMarkup(
    createElement(PageHeader, {
      title: 'Ordens',
      description: 'Gerencie as OS da loja',
      action: createElement('button', null, 'Nova OS'),
    }),
  );
  assert.match(html, /Ordens/);
  assert.match(html, /Gerencie as OS da loja/);
  assert.match(html, /Nova OS/);
});

test('EmptyState renders title without description when omitted', () => {
  const html = renderToStaticMarkup(createElement(EmptyState, { title: 'Nada por aqui' }));
  assert.match(html, /Nada por aqui/);
});

test('MaskedInput renders formatted values with an accessible native input mode', () => {
  const html = renderToStaticMarkup(
    createElement(maskedInputModule.MaskedInput, {
      mask: 'phone',
      value: '11987654321',
    }),
  );
  assert.match(html, /type="text"/);
  assert.match(html, /inputmode="tel"/i);
  assert.match(html, /value="\(11\) 98765-4321"/);
});

test('Badge renders its status text', () => {
  assert.equal(typeof badgeModule?.Badge, 'function');
  const html = renderToStaticMarkup(
    createElement(badgeModule.Badge, { variant: 'warning' }, 'Aguardando'),
  );
  assert.match(html, /Aguardando/);
  assert.match(html, /data-variant="warning"/);
  assert.match(html, /text-amber-700/);
});

test('dialog, select and textarea primitives expose the planned APIs', () => {
  assert.equal(typeof dialogModule?.Dialog, 'function');
  assert.equal(typeof dialogModule?.DialogContent, 'function');
  assert.equal(typeof dialogModule?.DialogTitle, 'function');
  assert.equal(typeof selectModule?.Select, 'function');
  assert.equal(typeof selectModule?.SelectContent, 'function');
  assert.equal(typeof textareaModule?.Textarea, 'function');
});

test('Table primitives keep headers and cells semantic', () => {
  assert.ok(tableModule);
  const html = renderToStaticMarkup(
    createElement(
      tableModule.Table,
      null,
      createElement(
        tableModule.TableHeader,
        null,
        createElement(tableModule.TableRow, null, createElement(tableModule.TableHead, null, 'OS')),
      ),
      createElement(
        tableModule.TableBody,
        null,
        createElement(
          tableModule.TableRow,
          null,
          createElement(tableModule.TableCell, null, 'OS-1'),
        ),
      ),
    ),
  );
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>OS<\/th>/);
  assert.match(html, /<td[^>]*>OS-1<\/td>/);
});
