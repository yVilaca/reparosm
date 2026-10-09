import { notifyPasswordChanged } from '@/lib/access';
import { clientIp, passwordHash, passwordProblem, sameOrigin, sessionCookie } from '@/lib/auth';
import { consumeLink, inspectLink } from '@/lib/repos/access-links';
import type { DataObject } from '@/lib/types';

/**
 * Links de acesso (convite, nova senha, confirmar e-mail). Tudo por POST: o
 * token nunca vai na URL de uma requisição, então não aparece em log nem em
 * histórico. "inspect" só mostra para quem é o link; "consume" o usa.
 */

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const problems: Record<string, string> = {
  invalid: 'Este link não é válido. Confira se copiou o endereço inteiro.',
  used: 'Este link já foi usado. Para entrar de novo, use sua senha ou peça um novo link.',
  expired: 'Este link venceu ou foi trocado por um mais novo. Peça um novo link para continuar.',
  blocked: 'Este acesso não está liberado. Fale com o dono da loja ou com o suporte ReparoSM.',
  'email-taken': 'Este e-mail já está em uso por outra pessoa no ReparoSM.',
};

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Solicitação inválida.' }, { status: 400 });
  }
  if (!isObject(body)) return json({ error: 'Solicitação inválida.' }, { status: 400 });
  const token = String(body.token || '');

  if (body.action === 'inspect') {
    const preview = await inspectLink(token);
    return preview.status === 'valid'
      ? json(preview)
      : json({ status: preview.status, error: problems[preview.status] });
  }

  if (body.action !== 'consume') return json({ error: 'Ação inválida.' }, { status: 400 });
  const password = body.password === undefined ? undefined : String(body.password);
  if (password !== undefined) {
    const problem = passwordProblem(password);
    if (problem) return json({ error: problem }, { status: 400 });
  }
  const preview = await inspectLink(token);
  if (preview.status === 'valid' && preview.purpose !== 'email' && password === undefined)
    return json({ error: 'Crie a senha para continuar.' }, { status: 400 });

  const result = await consumeLink(token, {
    hashPassword:
      password === undefined ? undefined : (username) => passwordHash(username, password),
    device: { userAgent: request.headers.get('user-agent') || '', ip: clientIp(request) },
  });
  if (result.status !== 'ok')
    return json({ status: result.status, error: problems[result.status] }, { status: 409 });

  if (result.purpose === 'reset')
    await notifyPasswordChanged({ ...result.user, storeName: result.storeName });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (result.sessionToken)
    headers['Set-Cookie'] = sessionCookie(
      result.sessionToken,
      undefined,
      new URL(request.url).protocol === 'https:',
    );
  return new Response(
    JSON.stringify({ ok: true, purpose: result.purpose, signedIn: Boolean(result.sessionToken) }),
    { headers },
  );
}
