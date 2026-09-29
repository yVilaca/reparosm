import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PrintOrderPhotos from '../components/print-order-photos.tsx';

test('renders nothing when there are no photos', () => {
  const html = renderToStaticMarkup(createElement(PrintOrderPhotos, { photos: [] }));
  assert.equal(html, '');
});

test('renders one image per photo pointing at the download route', () => {
  const html = renderToStaticMarkup(
    createElement(PrintOrderPhotos, {
      photos: [
        { id: 'photo-1', contentType: 'image/png' },
        { id: 'photo-2', contentType: 'image/jpeg' },
      ],
    }),
  );
  assert.match(html, /src="\/api\/order-photos\/photo-1"/);
  assert.match(html, /src="\/api\/order-photos\/photo-2"/);
  assert.match(html, /Fotos de prova/);
});
