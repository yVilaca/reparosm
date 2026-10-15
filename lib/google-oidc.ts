import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { env, requiredEnv } from '@/lib/env';
import { findIdentity, linkVerifiedGoogleIdentity } from '@/lib/repos/auth-security';
import type { AuthUserContext } from '@/lib/types';

const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

type Discovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

async function discovery(): Promise<Discovery> {
  const response = await fetch(DISCOVERY_URL, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Google indisponível.');
  const body = (await response.json()) as Record<string, unknown>;
  const result = {
    issuer: String(body.issuer || ''),
    authorizationEndpoint: String(body.authorization_endpoint || ''),
    tokenEndpoint: String(body.token_endpoint || ''),
    jwksUri: String(body.jwks_uri || ''),
  };
  if (
    result.issuer !== GOOGLE_ISSUERS[0] ||
    !result.authorizationEndpoint.startsWith('https://accounts.google.com/') ||
    result.tokenEndpoint !== 'https://oauth2.googleapis.com/token' ||
    !result.jwksUri.startsWith('https://www.googleapis.com/')
  )
    throw new Error('Configuração Google inválida.');
  return result;
}

const pkceChallenge = async (verifier: string) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url',
  );

export async function googleAuthorizationUrl(input: {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
}) {
  const settings = await discovery();
  const url = new URL(settings.authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID', env.googleClientId),
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: input.state,
    nonce: input.nonce,
    code_challenge: await pkceChallenge(input.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url;
}

export async function exchangeGoogleCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  const settings = await discovery();
  const response = await fetch(settings.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
      client_id: requiredEnv('GOOGLE_CLIENT_ID', env.googleClientId),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET', env.googleClientSecret),
    }),
  });
  if (!response.ok) throw new Error('Código Google inválido.');
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.id_token !== 'string' || !body.id_token) throw new Error('Token Google ausente.');
  return { idToken: body.id_token };
}

export async function verifyGoogleIdToken(
  idToken: string,
  options: { clientId: string; nonce: string; keySet?: JWTVerifyGetKey },
) {
  const keySet = options.keySet ?? createRemoteJWKSet(new URL((await discovery()).jwksUri));
  const { payload } = await jwtVerify(idToken, keySet, {
    algorithms: ['RS256'],
    issuer: GOOGLE_ISSUERS,
    audience: options.clientId,
    requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'exp', 'iat'],
    maxTokenAge: '10 minutes',
    clockTolerance: 5,
  });
  if (payload.nonce !== options.nonce) throw new Error('Nonce Google inválido.');
  if (payload.email_verified !== true) throw new Error('E-mail Google não confirmado.');
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string')
    throw new Error('Identidade Google inválida.');
  return { subject: payload.sub, email: payload.email.trim().toLowerCase() };
}

const active = (context: AuthUserContext | null): context is AuthUserContext =>
  Boolean(context && context.account.status === 'active' && context.user.status === 'active');

export async function resolveGoogleUser(subject: string, verifiedEmail: string) {
  const existing = await findIdentity('google', subject);
  if (existing) {
    if (!active(existing)) throw new Error('Acesso Google indisponível.');
    return existing;
  }
  try {
    const linked = await linkVerifiedGoogleIdentity(subject, verifiedEmail);
    if (!active(linked)) throw new Error('Acesso Google indisponível.');
    return linked;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const winner = await findIdentity('google', subject);
      if (active(winner)) return winner;
      throw new Error('Esta conta já possui outro acesso Google.');
    }
    throw error;
  }
}
