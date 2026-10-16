import {
  adminTransaction,
  authChallengeTransaction,
  authEmailTransaction,
  googleIdentityTransaction,
  setTenantContext,
  tenantTransaction,
  type Query,
} from '@/lib/db';
import { accountColumns, toAccount } from '@/lib/repos/accounts';
import { iso, type Timestamp } from '@/lib/repos/rows';
import { withOwnSession } from '@/lib/repos/sessions';
import { toUser, userColumns, type UserRow } from '@/lib/repos/users';
import type { AuthDevice, AuthMethod, AuthUserContext, MfaResetRequest } from '@/lib/types';

type IdentityRow = { account_id: string; user_id: string };

export type StoredAuthenticator = {
  accountId: string;
  userId: string;
  secretCiphertext: string;
  enabledAt?: string;
  lastUsedStep?: number;
  createdAt: string;
  updatedAt: string;
};

export type NewAuthChallenge = {
  user: AuthUserContext;
  purpose: 'login' | 'reset';
  method: AuthMethod;
  browserTokenHash?: string;
  userAgent: string;
  ip: string;
};

export type StoredAuthChallenge = {
  id: string;
  accountId: string;
  userId: string;
  purpose: 'login' | 'reset';
  method: AuthMethod;
  browserTokenHash?: string;
  userAgent: string;
  ip: string;
  expiresAt: string;
  usedAt?: string;
};

const randomToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('hex');
};

type DeviceRow = {
  id: string;
  account_id: string;
  user_id: string;
  user_agent: string;
  last_ip: string;
  last_seen_at: Timestamp;
  trusted_until: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

const toDevice = (row: DeviceRow): AuthDevice => ({
  id: row.id,
  accountId: row.account_id,
  userId: row.user_id,
  userAgent: row.user_agent,
  lastIp: row.last_ip,
  lastSeenAt: iso(row.last_seen_at),
  trustedUntil: row.trusted_until ? iso(row.trusted_until) : undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export const hashBrowserToken = sha256;

export async function deviceForLogin(
  context: AuthUserContext,
  rawBrowserToken: string,
  device: { userAgent: string; ip: string },
  run: Query,
) {
  const [row] = await run<DeviceRow>(
    `INSERT INTO auth_devices (
       account_id, user_id, browser_token_hash, user_agent, last_ip
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, browser_token_hash) DO UPDATE SET
       user_agent = EXCLUDED.user_agent,
       last_ip = EXCLUDED.last_ip,
       last_seen_at = now(),
       updated_at = now()
     RETURNING id, account_id, user_id, user_agent, last_ip, last_seen_at,
               trusted_until, created_at, updated_at`,
    [
      context.account.id,
      context.user.id,
      await hashBrowserToken(rawBrowserToken),
      device.userAgent.slice(0, 300),
      device.ip.slice(0, 80),
    ],
  );
  if (!row) throw new Error('Não foi possível reconhecer o aparelho.');
  return toDevice(row);
}

export const isTrusted = (device: Pick<AuthDevice, 'trustedUntil'>, now = Date.now()) =>
  Boolean(device.trustedUntil && Date.parse(device.trustedUntil) > now);

export async function trustDevice(deviceId: string, days: number, run: Query) {
  const [row] = await run<DeviceRow>(
    `UPDATE auth_devices
     SET trusted_until = now() + make_interval(days => $2), updated_at = now()
     WHERE id = $1
     RETURNING id, account_id, user_id, user_agent, last_ip, last_seen_at,
               trusted_until, created_at, updated_at`,
    [deviceId, days],
  );
  return row ? toDevice(row) : null;
}

export async function deviceForChallenge(userId: string, browserTokenHash: string, run: Query) {
  const [row] = await run<DeviceRow>(
    `SELECT id, account_id, user_id, user_agent, last_ip, last_seen_at,
            trusted_until, created_at, updated_at
     FROM auth_devices
     WHERE user_id = $1 AND browser_token_hash = $2`,
    [userId, browserTokenHash],
  );
  return row ? toDevice(row) : null;
}

export async function authContext(accountId: string, userId: string, run: Query) {
  const [user] = await run<UserRow>(
    `SELECT ${userColumns} FROM users u WHERE u.id = $1 AND u.account_id = $2`,
    [userId, accountId],
  );
  const [account] = await run<Parameters<typeof toAccount>[0]>(
    `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
    [accountId],
  );
  return user && account
    ? ({ user: toUser(user), account: toAccount(account) } satisfies AuthUserContext)
    : null;
}

export async function findIdentity(
  provider: 'google',
  subject: string,
): Promise<AuthUserContext | null> {
  return googleIdentityTransaction(subject, async (run) => {
    const [identity] = await run<IdentityRow>(
      `SELECT account_id, user_id FROM user_identities
       WHERE provider = $1 AND provider_subject = $2`,
      [provider, subject],
    );
    if (!identity) return null;

    await setTenantContext(run, identity.account_id);
    const [user] = await run<UserRow>(`SELECT ${userColumns} FROM users u WHERE u.id = $1`, [
      identity.user_id,
    ]);
    const [account] = await run<Parameters<typeof toAccount>[0]>(
      `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
      [identity.account_id],
    );
    if (!user || !account) return null;
    await run(
      `UPDATE user_identities SET last_used_at = now()
       WHERE provider = $1 AND provider_subject = $2`,
      [provider, subject],
    );
    return { user: toUser(user), account: toAccount(account) };
  });
}

export async function linkIdentity(
  user: AuthUserContext,
  subject: string,
  email: string,
  run?: Query,
) {
  const insert = (query: Query) =>
    query(
      `INSERT INTO user_identities (
         account_id, user_id, provider, provider_subject, email_at_link, last_used_at
       ) VALUES ($1, $2, 'google', $3, $4, now())`,
      [user.account.id, user.user.id, subject, email.trim().toLowerCase()],
    );
  if (run) await insert(run);
  else await tenantTransaction(user.account.id, insert);
}

/** First Google link: verified e-mail lookup and identity insert share one transaction. */
export async function linkVerifiedGoogleIdentity(subject: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return authEmailTransaction(normalizedEmail, async (run) => {
    const [user] = await run<UserRow>(
      `SELECT ${userColumns} FROM users u
       WHERE u.email = $1 AND u.email_verified_at IS NOT NULL
       FOR UPDATE`,
      [normalizedEmail],
    );
    if (!user) return null;
    await setTenantContext(run, user.account_id);
    const [account] = await run<Parameters<typeof toAccount>[0]>(
      `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
      [user.account_id],
    );
    if (!account || user.status !== 'active' || account.status !== 'active') return null;
    const context = { user: toUser(user), account: toAccount(account) } satisfies AuthUserContext;
    await linkIdentity(context, subject, normalizedEmail, run);
    return context;
  });
}

export async function authenticator(userId: string, run: Query) {
  const [row] = await run<{
    account_id: string;
    user_id: string;
    secret_ciphertext: string;
    enabled_at: Timestamp | null;
    last_used_step: string | number | null;
    created_at: Timestamp;
    updated_at: Timestamp;
  }>(
    `SELECT account_id, user_id, secret_ciphertext, enabled_at, last_used_step,
            created_at, updated_at
     FROM user_authenticators WHERE user_id = $1`,
    [userId],
  );
  if (!row) return null;
  return {
    accountId: row.account_id,
    userId: row.user_id,
    secretCiphertext: row.secret_ciphertext,
    enabledAt: row.enabled_at ? iso(row.enabled_at) : undefined,
    lastUsedStep: row.last_used_step === null ? undefined : Number(row.last_used_step),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  } satisfies StoredAuthenticator;
}

export async function savePendingAuthenticator(
  userId: string,
  accountId: string,
  ciphertext: string,
  run: Query,
) {
  await run(
    `INSERT INTO user_authenticators (account_id, user_id, secret_ciphertext)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       secret_ciphertext = EXCLUDED.secret_ciphertext,
       enabled_at = NULL,
       last_used_step = NULL,
       updated_at = now()`,
    [accountId, userId, ciphertext],
  );
}

export async function enableAuthenticator(
  userId: string,
  step: number,
  codeHashes: string[],
  run: Query,
) {
  const [enabled] = await run<{ account_id: string }>(
    `UPDATE user_authenticators
     SET enabled_at = now(), last_used_step = $2, updated_at = now()
     WHERE user_id = $1 RETURNING account_id`,
    [userId, step],
  );
  if (!enabled) throw new Error('Autenticador pendente não encontrado.');
  await run('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  await run(
    `INSERT INTO recovery_codes (account_id, user_id, code_hash)
     SELECT $2, $1, codes.code_hash FROM unnest($3::text[]) AS codes(code_hash)`,
    [userId, enabled.account_id, codeHashes],
  );
}

export async function createChallenge(input: NewAuthChallenge, run: Query) {
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  await run(
    `DELETE FROM auth_challenges
     WHERE user_id = $1 AND (used_at IS NOT NULL OR expires_at <= now())`,
    [input.user.user.id],
  );
  await run(
    `INSERT INTO auth_challenges (
       account_id, user_id, token_hash, purpose, auth_method, browser_token_hash,
       user_agent, ip, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '10 minutes')`,
    [
      input.user.account.id,
      input.user.user.id,
      tokenHash,
      input.purpose,
      input.method,
      input.browserTokenHash ?? null,
      input.userAgent.slice(0, 300),
      input.ip.slice(0, 80),
    ],
  );
  return rawToken;
}

export async function consumeChallenge(tokenHash: string, run: Query) {
  const [row] = await run<{
    id: string;
    account_id: string;
    user_id: string;
    purpose: 'login' | 'reset';
    auth_method: AuthMethod;
    browser_token_hash: string | null;
    user_agent: string;
    ip: string;
    expires_at: Timestamp;
    used_at: Timestamp;
  }>(
    `UPDATE auth_challenges SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING id, account_id, user_id, purpose, auth_method, browser_token_hash,
               user_agent, ip, expires_at, used_at`,
    [tokenHash],
  );
  return row
    ? ({
        id: row.id,
        accountId: row.account_id,
        userId: row.user_id,
        purpose: row.purpose,
        method: row.auth_method,
        browserTokenHash: row.browser_token_hash ?? undefined,
        userAgent: row.user_agent,
        ip: row.ip,
        expiresAt: iso(row.expires_at),
        usedAt: iso(row.used_at),
      } satisfies StoredAuthChallenge)
    : null;
}

export async function lockChallenge(tokenHash: string, run: Query) {
  const [row] = await run<{
    id: string;
    account_id: string;
    user_id: string;
    purpose: 'login' | 'reset';
    auth_method: AuthMethod;
    browser_token_hash: string | null;
    user_agent: string;
    ip: string;
    expires_at: Timestamp;
  }>(
    `SELECT id, account_id, user_id, purpose, auth_method, browser_token_hash,
            user_agent, ip, expires_at
     FROM auth_challenges
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     FOR UPDATE`,
    [tokenHash],
  );
  return row
    ? ({
        id: row.id,
        accountId: row.account_id,
        userId: row.user_id,
        purpose: row.purpose,
        method: row.auth_method,
        browserTokenHash: row.browser_token_hash ?? undefined,
        userAgent: row.user_agent,
        ip: row.ip,
        expiresAt: iso(row.expires_at),
      } satisfies StoredAuthChallenge)
    : null;
}

export async function consumeTotpStep(userId: string, step: number, run: Query) {
  const rows = await run(
    `UPDATE user_authenticators
     SET last_used_step = $2, updated_at = now()
     WHERE user_id = $1 AND enabled_at IS NOT NULL
       AND (last_used_step IS NULL OR last_used_step < $2)
     RETURNING user_id`,
    [userId, step],
  );
  return rows.length === 1;
}

export async function consumeRecoveryCode(userId: string, codeHash: string, run: Query) {
  const rows = await run(
    `UPDATE recovery_codes SET used_at = now()
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING id`,
    [userId, codeHash],
  );
  return rows.length === 1;
}

/** Estado de segurança do próprio usuário, sem segredos nem hashes. */
export async function ownSecuritySummary(token: string) {
  return withOwnSession(token, async (run, { userId }) => {
    const secondFactor = await authenticator(userId, run);
    const [identity] = await run<{ email_at_link: string; created_at: Timestamp }>(
      `SELECT email_at_link, created_at FROM user_identities
       WHERE user_id = $1 AND provider = 'google'`,
      [userId],
    );
    const [{ count }] = await run<{ count: string | number }>(
      'SELECT count(*) AS count FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    return {
      totpEnabled: Boolean(secondFactor?.enabledAt),
      googleIdentity: identity
        ? { email: identity.email_at_link, linkedAt: iso(identity.created_at) }
        : null,
      recoveryCodesRemaining: Number(count),
    };
  });
}

/** Credenciais necessárias para confirmar uma alteração sensível. */
export async function ownSecurityCredentials(userId: string, run: Query) {
  const [user] = await run<{ username: string; password_hash: string | null }>(
    `SELECT username, public.user_password_hash(id) AS password_hash
     FROM users WHERE id = $1`,
    [userId],
  );
  return user
    ? {
        username: user.username,
        passwordHash: user.password_hash ?? '',
        authenticator: await authenticator(userId, run),
      }
    : null;
}

export async function replaceRecoveryCodes(userId: string, codeHashes: string[], run: Query) {
  const [user] = await run<{ account_id: string }>('SELECT account_id FROM users WHERE id = $1', [
    userId,
  ]);
  if (!user) return false;
  await run('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  await run(
    `INSERT INTO recovery_codes (account_id, user_id, code_hash)
     SELECT $2, $1, codes.code_hash FROM unnest($3::text[]) AS codes(code_hash)`,
    [userId, user.account_id, codeHashes],
  );
  return true;
}

/** Remove o segundo fator, suas confianças e todas as sessões menos a atual. */
export async function disableOwnAuthenticator(
  userId: string,
  currentTokenHash: string,
  run: Query,
) {
  await run('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  const removed = await run(
    'DELETE FROM user_authenticators WHERE user_id = $1 RETURNING user_id',
    [userId],
  );
  await run('DELETE FROM auth_challenges WHERE user_id = $1', [userId]);
  await run('UPDATE auth_devices SET trusted_until = NULL, updated_at = now() WHERE user_id = $1', [
    userId,
  ]);
  await run('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [
    userId,
    currentTokenHash,
  ]);
  return removed.length === 1;
}

export async function unlinkOwnGoogle(userId: string, run: Query) {
  const removed = await run(
    "DELETE FROM user_identities WHERE user_id = $1 AND provider = 'google' RETURNING id",
    [userId],
  );
  return removed.length === 1;
}

export async function requestMfaReset(challengeToken: string) {
  const tokenHash = await sha256(challengeToken);
  return authChallengeTransaction(tokenHash, async (run) => {
    const challenge = await lockChallenge(tokenHash, run);
    if (!challenge || challenge.purpose !== 'login') return 'unavailable' as const;
    await setTenantContext(run, challenge.accountId);
    const context = await authContext(challenge.accountId, challenge.userId, run);
    const secondFactor = await authenticator(challenge.userId, run);
    if (
      !context ||
      !secondFactor?.enabledAt ||
      context.account.status !== 'active' ||
      context.user.status !== 'active'
    )
      return 'unavailable' as const;
    if (context.account.role === 'admin') return 'admin' as const;

    await run(
      `INSERT INTO mfa_reset_requests (account_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING`,
      [context.account.id, context.user.id],
    );
    return context.user.role;
  });
}

export async function listMfaResetRequests(
  run: Query,
  scope: { role: 'owner' } | { role: 'staff'; accountId: string },
): Promise<MfaResetRequest[]> {
  const rows = await run<{
    id: string;
    account_id: string;
    user_id: string;
    username: string;
    name: string;
    store_name: string;
    role: 'owner' | 'staff';
    requested_at: Timestamp;
  }>(
    `SELECT r.id, r.account_id, r.user_id, u.username, u.name, a.name AS store_name,
            u.role, r.requested_at
     FROM mfa_reset_requests r
     JOIN users u ON u.id = r.user_id
     JOIN accounts a ON a.id = r.account_id
     WHERE r.status = 'pending' AND u.status = 'active' AND a.status = 'active'
       AND u.role = $1 AND ($2::text IS NULL OR r.account_id = $2)
     ORDER BY r.requested_at, r.id`,
    [scope.role, scope.role === 'staff' ? scope.accountId : null],
  );
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    username: row.username,
    name: row.name,
    storeName: row.store_name,
    role: row.role,
    status: 'pending',
    requestedAt: iso(row.requested_at),
  }));
}

export async function clearUserMfa(userId: string, run: Query) {
  await run('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await run('DELETE FROM auth_challenges WHERE user_id = $1', [userId]);
  await run('DELETE FROM auth_devices WHERE user_id = $1', [userId]);
  await run('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  await run('DELETE FROM user_authenticators WHERE user_id = $1', [userId]);
}

export async function resolveMfaReset(
  actor: Readonly<{ id: string; role: 'owner' | 'admin' }>,
  userId: string,
  resolution: 'approved' | 'dismissed',
) {
  const resolve = async (run: Query) => {
    const [request] = await run<{ id: string }>(
      `SELECT r.id
       FROM mfa_reset_requests r
       JOIN users u ON u.id = r.user_id AND u.account_id = r.account_id
       WHERE r.user_id = $1 AND r.status = 'pending'
         AND (($2 = 'owner' AND u.role = 'staff' AND r.account_id = $3)
           OR ($2 = 'admin' AND u.role = 'owner' AND r.account_id <> 'account-admin'))
       FOR UPDATE OF r`,
      [userId, actor.role, actor.id],
    );
    if (!request) return false;
    if (resolution === 'approved') await clearUserMfa(userId, run);
    await run(
      `UPDATE mfa_reset_requests SET status = $2, resolved_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [request.id, resolution],
    );
    return true;
  };
  return actor.role === 'admin'
    ? adminTransaction({ id: actor.id, role: 'admin' }, resolve)
    : tenantTransaction(actor.id, resolve);
}
