import { query } from '@/lib/db';
import { accountColumns, toAccount } from '@/lib/repos/accounts';

export const SESSION_SECONDS = 60 * 60 * 12;

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Creates a session and returns its token; only the token's hash is stored. */
export async function createSession(accountId: string) {
  const token = crypto.randomUUID();
  await query('DELETE FROM sessions WHERE expires_at <= now()');
  await query(
    `INSERT INTO sessions (token_hash, account_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [await hashToken(token), accountId, SESSION_SECONDS],
  );
  return token;
}

/** The account behind a valid, unexpired session token (any status), or null. */
export async function accountForSession(token: string) {
  const [row] = await query<Parameters<typeof toAccount>[0]>(
    `SELECT ${accountColumns} FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [await hashToken(token)],
  );
  return row ? toAccount(row) : null;
}

export async function deleteSession(token: string) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [await hashToken(token)]);
}

export async function revokeSessions(accountId: string) {
  await query('DELETE FROM sessions WHERE account_id = $1', [accountId]);
}

const FAILURE_WINDOW = "interval '15 minutes'";
export const MAX_LOGIN_FAILURES = 10;

/** Failed logins for this user from this IP in the last 15 minutes. */
export async function recentLoginFailures(username: string, ip: string) {
  const [row] = await query<{ count: string | number }>(
    `SELECT count(*) AS count FROM login_failures
     WHERE username = $1 AND ip = $2 AND created_at > now() - ${FAILURE_WINDOW}`,
    [username, ip],
  );
  return Number(row?.count ?? 0);
}

export async function recordLoginFailure(username: string, ip: string) {
  await query(
    `DELETE FROM login_failures
     WHERE username = $1 AND ip = $2 AND created_at <= now() - ${FAILURE_WINDOW}`,
    [username, ip],
  );
  await query('INSERT INTO login_failures (username, ip) VALUES ($1, $2)', [username, ip]);
}

export async function clearLoginFailures(username: string, ip: string) {
  await query('DELETE FROM login_failures WHERE username = $1 AND ip = $2', [username, ip]);
}
