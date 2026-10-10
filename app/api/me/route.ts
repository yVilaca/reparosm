import {
  normalizeEmail,
  notifyPasswordChanged,
  pendingEmail,
  requestEmailChange,
} from '@/lib/access';
import { emailConfigured } from '@/lib/email';
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

/** Minha conta: cada pessoa cuida do próprio nome, e-mail, senha e aparelhos. */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function GET(request: Request) {
  const account = await currentAccount(request);
  const token = sessionToken(request);
  if (!account || !token) return json({ error: 'Não autenticado' }, 401);
  return json({
    user: account.user,
    sessions: (await listOwnSessions(token)) ?? [],
    pendingEmail: await pendingEmail(token),
    emailEnabled: emailConfigured(),
  });
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
    await notifyPasswordChanged({ ...account.user, storeName: account.name });
    return json({ ok: true });
  }

  if (body.action === 'email') {
    const email = normalizeEmail(body.email);
    if (!email) return json({ error: 'Informe um e-mail válido.' }, 400);
    const current = String(body.currentPassword || '');
    const result = await requestEmailChange(token, {
      email,
      passwordMatches: async (username, hash) =>
        (await verifyPassword(username, current, hash)).valid,
    });
    const errors: Partial<Record<typeof result, [string, number]>> = {
      'wrong-password': ['A senha atual não confere.', 400],
      'same-email': ['Este já é o seu e-mail.', 400],
      'too-many': ['Muitos pedidos seguidos. Espere alguns minutos e tente de novo.', 429],
      'not-sent': [
        'Não foi possível enviar o e-mail de confirmação agora. Tente mais tarde ou peça ao dono da loja para cadastrar o e-mail.',
        503,
      ],
      invalid: ['Não autenticado', 401],
    };
    const error = errors[result];
    if (error) return json({ error: error[0] }, error[1]);
    return json({ ok: true, pendingEmail: await pendingEmail(token) });
  }

  if (body.action === 'end-session') {
    const ended = await endOwnSession(token, String(body.id || ''));
    return ended ? json({ ok: true }) : json({ error: 'Aparelho não encontrado.' }, 404);
  }

  if (body.action === 'end-other-sessions')
    return json({ ended: (await endOtherOwnSessions(token)) ?? 0 });

  return json({ error: 'Ação inválida.' }, 400);
}
