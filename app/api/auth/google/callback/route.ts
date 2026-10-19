import {
  browserCookie,
  browserToken,
  clientIp,
  googleCookie,
  googleCookies,
  sessionCookie,
  type GoogleCookieName,
} from '@/lib/auth';
import { finishPrimaryAuth } from '@/lib/auth-flow';
import { env, requiredEnv } from '@/lib/env';
import { exchangeGoogleCode, resolveGoogleUser, verifyGoogleIdToken } from '@/lib/google-oidc';
import {
  clearLoginFailures,
  MAX_LOGIN_FAILURES,
  recentLoginFailures,
  recordLoginFailure,
  SeatLimitError,
} from '@/lib/repos/sessions';

const FAILURE_KEY = 'google:callback';
const googleCookieNames: GoogleCookieName[] = [
  'reparosm_google_state',
  'reparosm_google_nonce',
  'reparosm_google_verifier',
];

/**
 * `sameSite` answers with a page that navigates on its own instead of a 303: this
 * request started on accounts.google.com, so the whole redirect chain is cross-site
 * and the browser would withhold the SameSite=Strict session cookie on /ordens.
 */
const redirect = (path: string, cookies: string[] = [], sameSite = false) => {
  const secure = new URL(env.appUrl).protocol === 'https:';
  const location = new URL(path, env.appUrl).toString();
  const response = sameSite
    ? new Response(
        `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${location}"><title>Entrando…</title><a href="${location}">Continuar</a>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        },
      )
    : new Response(null, {
        status: 303,
        headers: { Location: location, 'Cache-Control': 'no-store' },
      });
  for (const value of cookies) response.headers.append('Set-Cookie', value);
  for (const name of googleCookieNames)
    response.headers.append('Set-Cookie', googleCookie(name, '', 0, secure));
  return response;
};

const validTransient = (value: string | undefined) =>
  Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const saved = googleCookies(request);
  if (
    url.searchParams.has('error') ||
    !code ||
    !validTransient(returnedState ?? undefined) ||
    !validTransient(saved.state) ||
    returnedState !== saved.state ||
    !validTransient(saved.nonce) ||
    !validTransient(saved.verifier)
  )
    return redirect('/login?erro=google');

  const ip = clientIp(request);
  if ((await recentLoginFailures(FAILURE_KEY, ip)) >= MAX_LOGIN_FAILURES)
    return redirect('/login?erro=google');
  try {
    const redirectUri = new URL('/api/auth/google/callback', env.appUrl).toString();
    const { idToken } = await exchangeGoogleCode({
      code,
      verifier: saved.verifier!,
      redirectUri,
    });
    const identity = await verifyGoogleIdToken(idToken, {
      clientId: requiredEnv('GOOGLE_CLIENT_ID', env.googleClientId),
      nonce: saved.nonce!,
    });
    const user = await resolveGoogleUser(identity.subject, identity.email);
    const result = await finishPrimaryAuth({
      user,
      method: 'google',
      browserToken: browserToken(request),
      userAgent: request.headers.get('user-agent') || '',
      ip,
    });
    await clearLoginFailures(FAILURE_KEY, ip);
    const secure = new URL(env.appUrl).protocol === 'https:';
    const cookies = [browserCookie(result.browserToken, undefined, secure)];
    if (result.step === 'complete')
      cookies.unshift(sessionCookie(result.sessionToken, undefined, secure));
    else
      cookies.unshift(
        `reparosm_mfa=${result.challengeToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`,
      );
    return result.step === 'complete'
      ? redirect('/ordens', cookies, true)
      : redirect('/login?etapa=verificacao', cookies);
  } catch (error) {
    // Login válido, loja sem vaga: não é tentativa suspeita.
    if (error instanceof SeatLimitError) return redirect('/login?erro=vagas');
    await recordLoginFailure(FAILURE_KEY, ip);
    return redirect('/login?erro=google');
  }
}
