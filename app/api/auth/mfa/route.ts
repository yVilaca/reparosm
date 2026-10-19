import { browserToken, clientIp, sameOrigin, sessionCookie } from '@/lib/auth';
import { completeMfa, MfaError } from '@/lib/auth-flow';
import { requestMfaReset } from '@/lib/repos/auth-security';
import { SeatLimitError } from '@/lib/repos/sessions';
import type { DataObject } from '@/lib/types';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const cookie = (request: Request, name: string) =>
  request.headers
    .get('cookie')
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação inválida.' }, 403);
  const challengeToken = cookie(request, 'reparosm_mfa');
  const rawBrowserToken = browserToken(request);
  if (!challengeToken || !rawBrowserToken)
    return json({ error: 'Confirmação expirada. Entre novamente.' }, 409);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  if (!isObject(body)) return json({ error: 'Dados inválidos.' }, 400);
  if (body.action === 'request-reset') {
    const result = await requestMfaReset(challengeToken);
    if (result === 'unavailable')
      return json({ error: 'Confirmação expirada. Entre novamente.' }, 409);
    return json({
      ok: true,
      message:
        result === 'admin'
          ? 'A conta administrativa exige o procedimento de emergência do ReparoSM.'
          : result === 'staff'
            ? 'Pedido enviado ao dono da loja.'
            : 'Pedido enviado ao suporte ReparoSM.',
    });
  }
  if (body.kind !== 'totp' && body.kind !== 'recovery')
    return json({ error: 'Dados inválidos.' }, 400);

  try {
    const result = await completeMfa({
      challengeToken,
      browserToken: rawBrowserToken,
      ip: clientIp(request),
      kind: body.kind,
      code: String(body.code || '').slice(0, 32),
      trustDevice: body.trustDevice === true,
    });
    const secure = new URL(request.url).protocol === 'https:';
    const response = json({ step: 'complete', account: result.account });
    response.headers.append('Set-Cookie', sessionCookie(result.sessionToken, undefined, secure));
    response.headers.append(
      'Set-Cookie',
      `reparosm_mfa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
    );
    return response;
  } catch (error) {
    // Código não foi consumido: a transação voltou e a pessoa tenta de novo depois.
    if (error instanceof SeatLimitError)
      return json({ error: error.message, holders: error.holders }, 409);
    if (!(error instanceof MfaError)) throw error;
    if (error.problem === 'limited')
      return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);
    if (error.problem === 'invalid') return json({ error: 'Código incorreto.' }, 401);
    return json({ error: 'Confirmação expirada ou já utilizada. Entre novamente.' }, 409);
  }
}
