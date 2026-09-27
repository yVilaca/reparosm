import {
  adminQuery,
  authQuery,
  loginFailureQuery,
  loginFailureTransaction,
  sessionTransaction,
  setSessionAccountContext,
  type AdminActor,
} from '@/lib/db';
import { accountColumns, toAccount } from '@/lib/repos/accounts';

export const SESSION_SECONDS = 60 * 60 * 12;

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Creates a session after removing only this account's expired sessions. */
export async function createSession(username: string, accountId: string) {
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  await authQuery(username, 'DELETE FROM sessions WHERE account_id = $1 AND expires_at <= now()', [
    accountId,
  ]);
  await authQuery(
    username,
    `INSERT INTO sessions (token_hash, account_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [tokenHash, accountId, SESSION_SECONDS],
  );
  return token;
}

/** The account behind a valid, unexpired session token (any status), or null. */
export async function accountForSession(token: string) {
  const account = await sessionTransaction(await hashToken(token), async (run) => {
    const [session] = await run<{ account_id: string }>(
      `SELECT account_id FROM sessions
       WHERE token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
         AND expires_at > now()`,
    );
    if (!session) return null;
    await setSessionAccountContext(run, session.account_id);
    const [row] = await run<Parameters<typeof toAccount>[0]>(
      `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
      [session.account_id],
    );
    return row ? toAccount(row) : null;
  });
  return account;
}

export async function deleteSession(token: string) {
  const tokenHash = await hashToken(token);
  await sessionTransaction(tokenHash, (run) =>
    run('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]),
  );
}

export async function revokeSessionsForLogin(username: string, accountId: string) {
  await authQuery(username, 'DELETE FROM sessions WHERE account_id = $1', [accountId]);
}

export async function revokeSessionsAsAdmin(actor: AdminActor, accountId: string) {
  await adminQuery(actor, 'DELETE FROM sessions WHERE account_id = $1', [accountId]);
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
