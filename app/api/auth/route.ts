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
import {
  clearLoginFailures,
  createSession,
  findLogin,
  MAX_LOGIN_FAILURES,
  recentLoginFailures,
  recordLoginFailure,
} from '@/lib/repos/sessions';
import { requestPasswordReset } from '@/lib/repos/users';
import type { DataObject } from '@/lib/types';

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
    const username = normalizeUser(String(body.username || '')).slice(0, 80);
    if (username.length < 3) return json({ error: 'Informe seu usuário.' }, { status: 400 });
    await requestPasswordReset(username);
    return json({
      ok: true,
      message:
        'Se o usuário estiver cadastrado, o pedido chega ao dono da loja (ou ao suporte ReparoSM, se você for o dono). Fale com ele para receber uma senha provisória.',
    });
  }
  if (body.action !== 'login') return json({ error: 'Ação inválida.' }, { status: 400 });
  const username = normalizeUser(String(body.username || '')).slice(0, 80);
  const password = String(body.password || '');
  const ip = clientIp(request);
  if (!username) return json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
  if ((await recentLoginFailures(username, ip)) >= MAX_LOGIN_FAILURES)
    return json(
      { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
      { status: 429 },
    );
  const login = await findLogin(username),
    verified = login
      ? await verifyPassword(username, password, login.passwordHash)
      : { valid: false, legacy: false };
  if (!login || !verified.valid) {
    await recordLoginFailure(username, ip);
    return json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
  }
  await clearLoginFailures(username, ip);
  if (login.account.status !== 'active')
    return json(
      { error: 'Esta loja não está liberada. Fale com o suporte ReparoSM.' },
      { status: 403 },
    );
  if (login.user.status !== 'active')
    return json({ error: 'Seu acesso foi desativado. Fale com o dono da loja.' }, { status: 403 });
  // Cada aparelho tem sua sessão: entrar aqui não derruba ninguém.
  const token = await createSession(
    username,
    login.user,
    { userAgent: request.headers.get('user-agent') || '', ip },
    verified.legacy ? await passwordHash(username, password) : undefined,
  );
  return new Response(JSON.stringify({ account: { ...login.account, user: login.user } }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, undefined, secure),
    },
  });
}
