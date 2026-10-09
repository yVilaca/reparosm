import {
  currentAccount,
  passwordHash,
  passwordProblem,
  sameOrigin,
  sessionToken,
  verifyPassword,
} from '@/lib/auth';
import {
  changeOwnPassword,
  endOtherOwnSessions,
  endOwnSession,
  listOwnSessions,
  updateOwnName,
} from '@/lib/repos/sessions';
import type { DataObject } from '@/lib/types';

/** Minha conta: cada pessoa cuida do próprio nome, senha e aparelhos. */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function GET(request: Request) {
  const account = await currentAccount(request);
  const token = sessionToken(request);
  if (!account || !token) return json({ error: 'Não autenticado' }, 401);
  return json({ user: account.user, sessions: (await listOwnSessions(token)) ?? [] });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação inválida.' }, 403);
  const account = await currentAccount(request);
  const token = sessionToken(request);
  if (!account || !token) return json({ error: 'Não autenticado' }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos' }, 400);
  }
  if (!isObject(body)) return json({ error: 'Dados inválidos' }, 400);

  if (body.action === 'profile') {
    const name = String(body.name || '')
      .trim()
      .slice(0, 80);
    if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
    return json({ user: await updateOwnName(token, name) });
  }

  if (body.action === 'password') {
    const next = String(body.password || '');
    const problem = passwordProblem(next);
    if (problem) return json({ error: problem }, 400);
    const current = String(body.currentPassword || '');
    if (current === next)
      return json({ error: 'A nova senha precisa ser diferente da atual.' }, 400);
    const result = await changeOwnPassword(token, async (user) =>
      (await verifyPassword(user.username, current, user.passwordHash)).valid
        ? passwordHash(user.username, next)
        : null,
    );
    if (result === 'wrong-password') return json({ error: 'A senha atual não confere.' }, 400);
    if (result !== 'ok') return json({ error: 'Não autenticado' }, 401);
    return json({ ok: true });
  }

  if (body.action === 'end-session') {
    const ended = await endOwnSession(token, String(body.id || ''));
    return ended ? json({ ok: true }) : json({ error: 'Aparelho não encontrado.' }, 404);
  }

  if (body.action === 'end-other-sessions')
    return json({ ended: (await endOtherOwnSessions(token)) ?? 0 });

  return json({ error: 'Ação inválida.' }, 400);
}
