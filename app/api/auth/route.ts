import {
  clientIp,
  currentAccount,
  endSession,
  ensureAdmin,
  normalizeUser,
  passwordHash,
  sameOrigin,
  sessionCookie,
  verifyPassword,
} from '@/lib/auth';
import { after } from 'next/server';
import { forgotPassword, normalizeEmail } from '@/lib/access';
import {
  clearLoginFailures,
  createSession,
  findLogin,
  MAX_LOGIN_FAILURES,
  recentLoginFailures,
  recordLoginFailure,
  usernameForEmail,
} from '@/lib/repos/sessions';
import type { DataObject } from '@/lib/types';

/**
 * Roda depois de responder: quem pede o link recebe a mesma resposta no mesmo
 * tempo, exista ou não o cadastro. Fora de uma requisição do Next (testes), roda já.
 */
async function afterResponse(task: () => Promise<void>) {
  const safe = () =>
    task().catch((error) => console.error('[acesso] Falha ao preparar o link:', error));
  try {
    after(safe);
  } catch {
    await safe();
  }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function GET(request: Request) {
  const account = await currentAccount(request);
  return account ? json({ account }) : json({ account: null }, { status: 401 });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  await ensureAdmin();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Solicitação inválida.' }, { status: 400 });
  }
  if (!isObject(body)) return json({ error: 'Solicitação inválida.' }, { status: 400 });
  const secure = new URL(request.url).protocol === 'https:';
  if (body.action === 'logout') {
    await endSession(request);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookie('', 0, secure),
      },
    });
  }
  if (body.action === 'forgot-password') {
    const identifier = String(body.username || '')
      .trim()
      .slice(0, 254);
    if (identifier.length < 3)
      return json({ error: 'Informe seu usuário ou e-mail.' }, { status: 400 });
    await afterResponse(() => forgotPassword(identifier));
    return json({
      ok: true,
      message:
        'Se encontrarmos o cadastro, mandamos agora um link para o e-mail dele. Quem não tem e-mail cadastrado: o pedido vai para o dono da loja (ou para o suporte ReparoSM, se você for o dono).',
    });
  }
  if (body.action !== 'login') return json({ error: 'Ação inválida.' }, { status: 400 });
  // Entra com o usuário ou com o e-mail cadastrado.
  const typed = String(body.username || '')
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const email = typed.includes('@') ? normalizeEmail(typed) : null;
  const attempt = email ?? normalizeUser(typed).slice(0, 80);
  const password = String(body.password || '');
  const ip = clientIp(request);
  if (!attempt) return json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
  if ((await recentLoginFailures(attempt, ip)) >= MAX_LOGIN_FAILURES)
    return json(
      { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
      { status: 429 },
    );
  const username = email ? await usernameForEmail(email) : attempt;
  const login = username ? await findLogin(username) : null,
    verified = login
      ? await verifyPassword(login.user.username, password, login.passwordHash)
      : { valid: false, legacy: false };
  if (!login || !verified.valid) {
    await recordLoginFailure(attempt, ip);
    return json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
  }
  await clearLoginFailures(attempt, ip);
  if (login.account.status !== 'active')
    return json(
      { error: 'Esta loja não está liberada. Fale com o suporte ReparoSM.' },
      { status: 403 },
    );
  if (login.user.status !== 'active')
    return json({ error: 'Seu acesso foi desativado. Fale com o dono da loja.' }, { status: 403 });
  // Cada aparelho tem sua sessão: entrar aqui não derruba ninguém.
  const token = await createSession(
    login.user.username,
    login.user,
    { userAgent: request.headers.get('user-agent') || '', ip },
    verified.legacy ? await passwordHash(login.user.username, password) : undefined,
  );
  return new Response(JSON.stringify({ account: { ...login.account, user: login.user } }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, undefined, secure),
    },
  });
}
