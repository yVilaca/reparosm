import { googleCookie } from '@/lib/auth';
import { env, googleConfigured } from '@/lib/env';
import { googleAuthorizationUrl } from '@/lib/google-oidc';

const randomToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

export async function GET() {
  if (!googleConfigured()) return Response.redirect(new URL('/login?erro=google', env.appUrl), 303);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const redirectUri = new URL('/api/auth/google/callback', env.appUrl).toString();
  const authorization = await googleAuthorizationUrl({ state, nonce, verifier, redirectUri });
  const secure = new URL(env.appUrl).protocol === 'https:';
  const response = new Response(null, {
    status: 302,
    headers: { Location: authorization.toString() },
  });
  response.headers.append('Set-Cookie', googleCookie('reparosm_google_state', state, 600, secure));
  response.headers.append('Set-Cookie', googleCookie('reparosm_google_nonce', nonce, 600, secure));
  response.headers.append(
    'Set-Cookie',
    googleCookie('reparosm_google_verifier', verifier, 600, secure),
  );
  return response;
}
