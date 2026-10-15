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
} from '@/lib/repos/sessions';

const FAILURE_KEY = 'google:callback';
const googleCookieNames: GoogleCookieName[] = [
  'reparosm_google_state',
  'reparosm_google_nonce',
  'reparosm_google_verifier',
];

const redirect = (path: string, cookies: string[] = []) => {
  const secure = new URL(env.appUrl).protocol === 'https:';
  const response = new Response(null, {
    status: 303,
    headers: { Location: new URL(path, env.appUrl).toString() },
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
    return redirect(result.step === 'complete' ? '/ordens' : '/login?etapa=verificacao', cookies);
  } catch {
    await recordLoginFailure(FAILURE_KEY, ip);
    return redirect('/login?erro=google');
  }
}
