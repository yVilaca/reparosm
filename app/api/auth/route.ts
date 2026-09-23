import {
  accountByUsername,
  clientIp,
  currentAccount,
  endSession,
  ensureAdmin,
  normalizeUser,
  passwordHash,
  publicAccount,
  revokeSessions,
  sameOrigin,
  sessionCookie,
  verifyPassword,
} from '@/lib/auth';
import { requestPasswordReset, setPasswordHash } from '@/lib/repos/accounts';
import {
  clearLoginFailures,
  createSession,
  MAX_LOGIN_FAILURES,
  recentLoginFailures,
  recordLoginFailure,
} from '@/lib/repos/sessions';
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
  return account
    ? json({ account: publicAccount(account) })
    : json({ account: null }, { status: 401 });
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
    const account = await accountByUsername(username);
    if (account?.role === 'merchant') await requestPasswordReset(account.id);
    return json({
      ok: true,
      message:
        'Se o usuário estiver cadastrado, o administrador receberá a solicitação. Entre em contato com ele para confirmar sua identidade e receber a nova senha.',
    });
  }
  if (body.action !== 'login') return json({ error: 'Ação inválida.' }, { status: 400 });
  const username = normalizeUser(String(body.username || '')).slice(0, 80);
  const password = String(body.password || '');
  const ip = clientIp(request);
  if ((await recentLoginFailures(username, ip)) >= MAX_LOGIN_FAILURES)
    return json(
      { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
      { status: 429 },
    );
  const account = await accountByUsername(username),
    verified = account
      ? await verifyPassword(username, password, account.passwordHash)
      : { valid: false, legacy: false };
  if (!account || !verified.valid) {
    await recordLoginFailure(username, ip);
    return json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
  }
  await clearLoginFailures(username, ip);
  if (account.status !== 'active')
    return json(
      { error: 'Esta conta não está liberada. Fale com o administrador.' },
      { status: 403 },
    );
  if (verified.legacy) await setPasswordHash(account.id, await passwordHash(username, password));
  await revokeSessions(account.id);
  const token = await createSession(account.id);
  return new Response(JSON.stringify({ account: publicAccount(account) }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, undefined, secure),
    },
  });
}
