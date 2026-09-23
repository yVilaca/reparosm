import {
  accountByUsername,
  currentAccount,
  currentSession,
  ensureAdmin,
  normalizeUser,
  passwordHash,
  publicAccount,
  revokeSessions,
  sameOrigin,
  sessionCookie,
  verifyPassword,
} from '@/lib/auth';
import { deleteRecord, getRecord, saveRecord } from '@/lib/db';

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });

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
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Solicitação inválida.' }, { status: 400 });
  }
  const secure = new URL(request.url).protocol === 'https:';
  if (body.action === 'logout') {
    const session = await currentSession(request);
    if (session) await deleteRecord(session.record.id);
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
    if (account?.type === 'account' && account.data.role === 'merchant') {
      const id = `password-request-${account.id}`,
        existing = await getRecord(id);
      if (existing?.data?.status !== 'pending') {
        await saveRecord(id, 'password-request', {
          accountId: account.id,
          username,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
    }
    return json({
      ok: true,
      message:
        'Se o usuário estiver cadastrado, o administrador receberá a solicitação. Entre em contato com ele para confirmar sua identidade e receber a nova senha.',
    });
  }
  if (body.action !== 'login') return json({ error: 'Ação inválida.' }, { status: 400 });
  const username = normalizeUser(String(body.username || ''));
  const account = await accountByUsername(username),
    verified =
      account?.type === 'account'
        ? await verifyPassword(
            username,
            String(body.password || ''),
            String(account.data.passwordHash || ''),
          )
        : { valid: false, legacy: false };
  if (!account || !verified.valid)
    return json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
  if (account.data.status !== 'active')
    return json(
      { error: 'Esta conta não está liberada. Fale com o administrador.' },
      { status: 403 },
    );
  const data = verified.legacy
    ? {
        ...account.data,
        passwordHash: await passwordHash(username, String(body.password || '')),
        mustChangePassword: false,
      }
    : account.data;
  if (verified.legacy) await saveRecord(account.id, 'account', data);
  await revokeSessions(account.id);
  const token = crypto.randomUUID(),
    expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await saveRecord(`session-${token}`, 'session', {
    accountId: account.id,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify({ account: publicAccount({ id: account.id, ...data }) }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, 60 * 60 * 12, secure),
    },
  });
}
