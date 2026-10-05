import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import MyShopRoute from '../components/my-shop-route.tsx';

const render = (initialShop = { id: 'shop-main', name: 'Loja', phone: '11999999999' }) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: { refresh() {} } },
      createElement(FeedbackProvider, null, createElement(MyShopRoute, { initialShop })),
    ),
  );

test('offers a restricted image upload for the shop logo', () => {
  const html = render();
  assert.match(html, /id="shop-logo-file"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(html, /Anexar arquivo de imagem/);
  assert.match(html, /Até 1 MB/);
});

test('shows the uploaded logo as a preview without exposing the file input value', () => {
  const html = render({
    id: 'shop-main',
    name: 'Loja',
    phone: '11999999999',
    logo: '/api/shops/logo',
  });
  assert.match(html, /src="\/api\/shops\/logo"/);
  assert.match(html, /Remover logo/);
  assert.doesNotMatch(html, /type="url"[^>]*value="\/api\/shops\/logo"/);
});
