import {
  adminQuery,
  authEmailTransaction,
  authTransaction,
  loginFailureQuery,
  loginFailureTransaction,
  sessionTransaction,
  setSessionAccountContext,
  type AdminActor,
  type Query,
} from '@/lib/db';
import { accountColumns, toAccount } from '@/lib/repos/accounts';
import { iso, type Timestamp } from '@/lib/repos/rows';
import { toUser, userColumns, type UserRow } from '@/lib/repos/users';
import type { SessionAccount, StoreSession, StoreUser } from '@/lib/types';

export const SESSION_SECONDS = 60 * 60 * 12;

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Login: o usuário, a senha guardada e a loja dele, ou null. */
export async function findLogin(username: string) {
  return authTransaction(username, async (run) => {
    const [row] = await run<UserRow & { password_hash: string | null }>(
      `SELECT ${userColumns}, public.user_password_hash(u.id) AS password_hash
       FROM users u WHERE u.username = $1`,
      [username],
    );
    if (!row) return null;
    const [account] = await run<Parameters<typeof toAccount>[0]>(
      `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
      [row.account_id],
    );
    if (!account) return null;
    return {
      user: toUser(row),
      passwordHash: row.password_hash ?? '',
      account: toAccount(account),
    };
  });
}

/** O usuário dono de um e-mail (login e "esqueci minha senha" pelo e-mail). */
export async function usernameForEmail(email: string) {
  const [row] = await authEmailTransaction(email, (run) =>
    run<{ username: string }>('SELECT username FROM users WHERE email = $1', [email]),
  );
  return row?.username ?? null;
}

export type Device = { userAgent: string; ip: string };

/**
 * Abre uma sessão dentro de uma transação já no login do usuário
 * (app.auth_username): cada aparelho tem a sua, e só as já vencidas dele saem.
 */
export async function insertSession(
  run: Query,
  user: Pick<StoreUser, 'id' | 'accountId'>,
  device: Device,
  upgradedHash?: string,
) {
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  await run('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [user.id]);
  await run(
    `INSERT INTO sessions (token_hash, account_id, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6)`,
    [
      tokenHash,
      user.accountId,
      user.id,
      SESSION_SECONDS,
      device.userAgent.slice(0, 300),
      device.ip.slice(0, 80),
    ],
  );
  // Senha no formato antigo é regravada no novo, no mesmo acesso. (O runtime
  // não lê password_hash, então não dá para usar COALESCE com a coluna.)
  await run(
    upgradedHash
      ? 'UPDATE users SET last_login_at = now(), password_hash = $2 WHERE id = $1'
      : 'UPDATE users SET last_login_at = now() WHERE id = $1',
    upgradedHash ? [user.id, upgradedHash] : [user.id],
  );
  return token;
}

/** Abre uma sessão sem derrubar as outras (dele ou da loja). */
export async function createSession(
  username: string,
  user: Pick<StoreUser, 'id' | 'accountId'>,
  device: Device,
  upgradedHash?: string,
) {
  return authTransaction(username, (run) => insertSession(run, user, device, upgradedHash));
}

/** A loja e o usuário por trás de um token válido (qualquer situação), ou null. */
export async function accountForSession(token: string): Promise<SessionAccount | null> {
  return sessionTransaction(await hashToken(token), async (run) => {
    const [session] = await run<{ account_id: string }>(
      `SELECT account_id FROM sessions
       WHERE token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
         AND expires_at > now()`,
    );
    if (!session) return null;
    const userId = await setSessionAccountContext(run, session.account_id);
    const [account] = await run<Parameters<typeof toAccount>[0]>(
      `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
      [session.account_id],
    );
    const [user] = await run<UserRow>(`SELECT ${userColumns} FROM users u WHERE u.id = $1`, [
      userId,
    ]);
    return account && user ? { ...toAccount(account), user: toUser(user) } : null;
  });
}

export async function deleteSession(token: string) {
  const tokenHash = await hashToken(token);
  await sessionTransaction(tokenHash, (run) =>
    run('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]),
  );
}

/** Loja suspensa, cancelada ou excluída: todos saem. */
export async function revokeSessionsAsAdmin(actor: AdminActor, accountId: string) {
  await adminQuery(actor, 'DELETE FROM sessions WHERE account_id = $1', [accountId]);
}

/**
 * Roda `fn` dentro da sessão do próprio usuário (app.session_user_id), para ele
 * cuidar da própria conta. Null se a sessão não vale mais.
 */
export async function withOwnSession<T>(
  token: string,
  fn: (run: Query, session: { userId: string; accountId: string; tokenHash: string }) => Promise<T>,
) {
  const tokenHash = await hashToken(token);
  return sessionTransaction(tokenHash, async (run) => {
    const [session] = await run<{ account_id: string }>(
      `SELECT account_id FROM sessions
       WHERE token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
         AND expires_at > now()`,
    );
    if (!session) return null;
    const userId = await setSessionAccountContext(run, session.account_id);
    return fn(run, { userId, accountId: session.account_id, tokenHash });
  });
}

/** Os aparelhos conectados do usuário, este primeiro. */
export async function listOwnSessions(token: string) {
  return withOwnSession(token, async (run, { userId, tokenHash }) => {
    const rows = await run<{
      id: string;
      user_agent: string | null;
      ip: string | null;
      created_at: Timestamp;
      expires_at: Timestamp;
      current: boolean;
    }>(
      `SELECT id, user_agent, ip, created_at, expires_at, token_hash = $2 AS current
       FROM sessions WHERE user_id = $1 AND expires_at > now()
       ORDER BY token_hash = $2 DESC, created_at DESC`,
      [userId, tokenHash],
    );
    return rows.map((row): StoreSession => ({
      id: row.id,
      userAgent: row.user_agent ?? '',
      ip: row.ip ?? '',
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      current: row.current,
    }));
  });
}

/** Encerra um aparelho do próprio usuário. */
export async function endOwnSession(token: string, sessionId: string) {
  return withOwnSession(token, async (run, { userId }) => {
    const rows = await run('DELETE FROM sessions WHERE id = $1 AND user_id = $2 RETURNING id', [
      sessionId,
      userId,
    ]);
    return rows.length > 0;
  });
}

/** "Sair dos outros aparelhos": fica só este. */
export async function endOtherOwnSessions(token: string) {
  return withOwnSession(token, async (run, { userId, tokenHash }) => {
    const rows = await run(
      'DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2 RETURNING id',
      [userId, tokenHash],
    );
    return rows.length;
  });
}

export async function updateOwnName(token: string, name: string) {
  return withOwnSession(token, async (run, { userId }) => {
    const [row] = await run<UserRow>(
      `UPDATE users AS u SET name = $2, updated_at = now() WHERE u.id = $1
       RETURNING ${userColumns}`,
      [userId, name],
    );
    return row ? toUser(row) : null;
  });
}

/**
 * Troca a senha do próprio usuário: confere a atual, grava a nova (deixa de ser
 * provisória) e desconecta os outros aparelhos dele.
 */
export async function changeOwnPassword(
  token: string,
  check: (user: { username: string; passwordHash: string }) => Promise<string | null>,
) {
  return withOwnSession(token, async (run, { userId, tokenHash }) => {
    const [row] = await run<{ username: string; password_hash: string | null }>(
      'SELECT username, public.user_password_hash(id) AS password_hash FROM users WHERE id = $1',
      [userId],
    );
    if (!row) return 'invalid' as const;
    const newHash = await check({ username: row.username, passwordHash: row.password_hash ?? '' });
    if (!newHash) return 'wrong-password' as const;
    await run(
      `UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now()
       WHERE id = $1`,
      [userId, newHash],
    );
    await run('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash]);
    return 'ok' as const;
  });
}

const FAILURE_WINDOW = "interval '15 minutes'";
export const MAX_LOGIN_FAILURES = 10;

/** Failed logins for this user from this IP in the last 15 minutes. */
export async function recentLoginFailures(username: string, ip: string) {
  const [row] = await loginFailureQuery<{ count: string | number }>(
    username,
    ip,
    `SELECT count(*) AS count FROM login_failures
     WHERE username = $1 AND ip = $2 AND created_at > now() - ${FAILURE_WINDOW}`,
    [username, ip],
  );
  return Number(row?.count ?? 0);
}

export async function recordLoginFailure(username: string, ip: string) {
  await loginFailureTransaction(username, ip, async (run) => {
    await run(
      `DELETE FROM login_failures
       WHERE username = $1 AND ip = $2 AND created_at <= now() - ${FAILURE_WINDOW}`,
      [username, ip],
    );
    await run('INSERT INTO login_failures (username, ip) VALUES ($1, $2)', [username, ip]);
  });
}

export async function clearLoginFailures(username: string, ip: string) {
  await loginFailureQuery(
    username,
    ip,
    'DELETE FROM login_failures WHERE username = $1 AND ip = $2',
    [username, ip],
  );
}
