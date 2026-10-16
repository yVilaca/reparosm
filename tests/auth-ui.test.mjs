import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props));

test('the auth shell keeps ReparoSM identity across login, access and MFA', async () => {
  const { default: AuthShell } = await import('../components/auth-shell.tsx');
  const { default: Login } = await import('../components/login.tsx');
  const { default: AccessRoute } = await import('../components/access-route.tsx');
  const shell = render(AuthShell, {
    eyebrow: 'Acesso seguro',
    title: 'Entre na sua assistência',
    description: 'Cada pessoa usa seu próprio acesso.',
    children: createElement('p', null, 'Conteúdo'),
  });
  const login = render(Login, { googleEnabled: true, onLogin() {} });
  const mfa = render(Login, { initialMode: 'mfa', onLogin() {} });
  const access = render(AccessRoute);

  for (const html of [shell, login, mfa, access]) assert.match(html, /ReparoSM/);
  assert.match(login, /Continuar com Google/);
  assert.match(mfa, /Confiar neste dispositivo por 30 dias/);
  assert.match(mfa, /código de recuperação/i);
  assert.match(access, /Abrindo o link/);
  assert.match(shell, /Da bancada ao caixa/);
});

test('auth forms preserve labels, autocomplete and accessible errors', async () => {
  const { default: Login } = await import('../components/login.tsx');
  const login = render(Login, {
    googleEnabled: false,
    initialError: 'Não foi possível entrar com Google.',
    onLogin() {},
  });
  const mfa = render(Login, { initialMode: 'mfa', onLogin() {} });

  assert.match(login, /<label[^>]*for="login-username"/);
  assert.match(login, /auto[Cc]omplete="username"/);
  assert.match(login, /auto[Cc]omplete="current-password"/);
  assert.match(login, /role="alert"/);
  // Sem as envs do Google o botão aparece, mas desabilitado e sem link.
  assert.match(login, /disabled=""[^>]*title="Login com Google ainda não configurado"/);
  assert.doesNotMatch(login, /href="\/api\/auth\/google"/);
  assert.match(mfa, /auto[Cc]omplete="one-time-code"/);
  assert.match(mfa, /inputMode="numeric"|inputmode="numeric"/);
  assert.doesNotMatch(mfa, /QR|qrcode/i);
});

test('security setup exposes QR, manual key and one-time recovery actions', async () => {
  const { default: AccountSecurity } = await import('../components/account-security.tsx');
  const { FeedbackProvider } = await import('../components/feedback.tsx');
  const html = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(AccountSecurity, {
        initialSecurity: {
          totpEnabled: false,
          googleIdentity: null,
          recoveryCodesRemaining: 0,
          devices: [],
        },
      }),
    ),
  );
  assert.match(html, /Ativar autenticador/);
  assert.match(html, /recomendado/i);
  assert.match(html, /Aparelhos/);
  assert.doesNotMatch(html, /otpauth:|Chave manual/);
});

test('security summary never renders authenticator or recovery secrets again', async () => {
  const { default: AccountSecurity } = await import('../components/account-security.tsx');
  const { FeedbackProvider } = await import('../components/feedback.tsx');
  const html = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(AccountSecurity, {
        initialSecurity: {
          totpEnabled: true,
          googleIdentity: null,
          recoveryCodesRemaining: 8,
          devices: [],
        },
      }),
    ),
  );
  assert.match(html, /8 códigos disponíveis/);
  assert.doesNotMatch(html, /otpauth:|Chave manual|ABCD-EFGH|secret_ciphertext/i);
});
