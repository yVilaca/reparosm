import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountsRoute from '../components/accounts-route.tsx';
import { FeedbackProvider } from '../components/feedback.tsx';
import TeamRoute from '../components/team-route.tsx';
import { deviceLabel, lastAccessLabel, whenLabel } from '../lib/user-labels.ts';

const render = (component, props) =>
  renderToStaticMarkup(createElement(FeedbackProvider, null, createElement(component, props)));
const day = (offset) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + offset * 86400000),
  );

test('names the device from its user agent', () => {
  assert.equal(
    deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit Chrome/130.0 Safari/537.36'),
    'Chrome no Windows',
  );
  assert.equal(
    deviceLabel(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
    ),
    'Safari no iPhone',
  );
  assert.equal(
    deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0'),
    'Edge no Windows',
  );
  assert.equal(
    deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile'),
    'Chrome no Android',
  );
  assert.equal(deviceLabel(''), 'Navegador desconhecido');
});

test('says when in São Paulo time: today, yesterday or the date', () => {
  const now = new Date('2026-10-08T15:00:00-03:00');
  assert.equal(whenLabel('2026-10-08T09:12:00-03:00', now), 'hoje às 09:12');
  assert.equal(whenLabel('2026-10-07T23:59:00-03:00', now), 'ontem às 23:59');
  assert.equal(whenLabel('2026-10-01T08:05:00-03:00', now), '01/10 às 08:05');
  assert.equal(lastAccessLabel(undefined, now), 'Ainda não entrou');
});

const store = (id, overrides = {}) => ({
  id: `account-${id}`,
  username: id,
  name: `Loja ${id}`,
  role: 'merchant',
  status: 'active',
  plan: 'Mensal',
  dueDate: day(60),
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  ownerName: `Dono ${id}`,
  ownerUsername: id,
  users: 1,
  ...overrides,
});

test('stores are listed by urgency, with renewal only where it matters', () => {
  const html = render(AccountsRoute, {
    initialStores: [
      store('emdia'),
      store('suspensa', { status: 'suspended', dueDate: day(-3) }),
      store('vencida', { dueDate: day(-5) }),
      store('cortesia', { plan: 'Cortesia', dueDate: '' }),
      store('vencendo', { dueDate: day(2), users: 3 }),
    ],
    initialRequests: [
      {
        id: 'password-request-user-x',
        userId: 'user-x',
        accountId: 'account-vencida',
        username: 'vencida',
        name: 'Dono vencida',
        storeName: 'Loja vencida',
        createdAt: new Date().toISOString(),
      },
    ],
  });
  const order = ['vencida', 'vencendo', 'cortesia', 'emdia', 'suspensa'].map((id) =>
    html.indexOf(`aria-label="Abrir Loja ${id}"`),
  );
  assert.ok(order.every((at) => at > 0));
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'vencidas primeiro, suspensas no fim',
  );
  assert.match(html, /Venceu há 5 dias/);
  assert.match(html, /Cortesia, sem vencimento/);
  assert.match(html, /Dono vencendo · vencendo · 3 pessoas/);
  assert.equal((html.match(/>Renovar</g) || []).length, 2, 'só a vencida e a que vence em breve');
  assert.match(html, /Donos que pediram senha nova/);
  assert.match(html, /Loja vencida · vencida · sem e-mail · pediu hoje/);
});

test('the team shows roles, who is you, invites, provisional passwords and password requests', () => {
  const member = (id, overrides = {}) => ({
    id: `user-${id}`,
    accountId: 'account-demo',
    username: id,
    name: `Pessoa ${id}`,
    role: 'staff',
    status: 'active',
    emailVerified: false,
    mustChangePassword: false,
    access: 'ready',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    sessions: 0,
    passwordRequested: false,
    ...overrides,
  });
  const html = render(TeamRoute, {
    storeName: 'Cell Prime',
    selfId: 'user-dono',
    emailEnabled: false,
    initialUsers: [
      member('dono', { role: 'owner', sessions: 2, email: 'dono@loja.test', emailVerified: true }),
      member('convidada', { access: 'invited', email: 'convidada@loja.test' }),
      member('atrasada', { access: 'invite-expired' }),
      member('nova', { mustChangePassword: true, sessions: 1 }),
      member('esqueceu', { passwordRequested: true }),
      member('saiu', { status: 'disabled' }),
    ],
    initialRequests: [
      {
        id: 'password-request-user-esqueceu',
        userId: 'user-esqueceu',
        accountId: 'account-demo',
        username: 'esqueceu',
        name: 'Pessoa esqueceu',
        storeName: 'Cell Prime',
        createdAt: new Date().toISOString(),
      },
    ],
  });
  assert.match(html, /Pediram senha nova/);
  assert.match(html, /dono@loja.test · Dono/, 'mostra o e-mail quando existe');
  assert.match(html, /Convite pendente/);
  assert.match(html, /Convite vencido/);
  assert.match(html, /envio de e-mail ainda não está ligado/);
  assert.match(html, /Gerar link de nova senha/);
  assert.match(html, /nova · Funcionário/);
  assert.match(html, />Você</);
  assert.match(html, /Conectado em 2 aparelhos/);
  assert.match(html, /Senha provisória/);
  assert.match(html, /Ainda não entrou/);
  assert.match(html, /Sem acesso<\/h2>|Sem acesso<span/);
  // Não há menu de ações para a própria pessoa.
  assert.doesNotMatch(html, /aria-label="[^"]*Pessoa dono[^"]*"/);
});
