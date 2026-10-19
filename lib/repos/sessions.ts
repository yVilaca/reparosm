import {
  adminQuery,
  authEmailTransaction,
  authTransaction,
  loginFailureQuery,
  loginFailureTransaction,
  sessionTransaction,
  setSessionAccountContext,
  setTenantContext,
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

/** A loja já tem todas as vagas ocupadas por logins de outras pessoas. */
export class SeatLimitError extends Error {
  constructor(
    readonly holders: string[],
    readonly max: number,
  ) {
    super(
      `A loja já está com ${max === 1 ? '1 acesso em uso' : `${max} acessos em uso`}` +
        `${holders.length ? ` (${holders.join(', ')})` : ''}, o limite do plano. ` +
        'Peça para alguém sair ou fale com o dono da loja.',
    );
  }
}

/**
 * 1 login = 1 vaga: cada sessão válida ocupa uma, em qualquer aparelho, para que um
 * mesmo usuário e senha não sirva a duas pessoas ao mesmo tempo. Loja cheia:
 * - a pessoa já tem sessão: a mais antiga dela sai (a vaga muda de aparelho);
 * - senão, o dono entra e derruba a sessão mais antiga da loja;
 * - senão (funcionário), é recusado. O admin não tem limite.
 * ponytail: lock por loja (advisory) serializa logins da mesma loja; sessão de aba
 * fechada segura a vaga até vencer (12h) ou ser derrubada. Heartbeat se incomodar.
 */
async function claimSeat(run: Query, user: Pick<StoreUser, 'id' | 'accountId'>) {
  // A credencial já foi conferida: o escopo da loja permite ver os colegas.
  await setTenantContext(run, user.accountId);
  await run('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`seat:${user.accountId}`]);
  const [account] = await run<{ role: string; max_active_users: number }>(
    'SELECT role, max_active_users FROM accounts WHERE id = $1',
    [user.accountId],
  );
  if (!account || account.role === 'admin') return;
  const live = await run<{ id: string; user_id: string; name: string }>(
    `SELECT s.id, s.user_id, u.name
     FROM sessions AS s JOIN users AS u ON u.id = s.user_id
     WHERE s.account_id = $1 AND s.expires_at > now()
     ORDER BY s.created_at`,
    [user.accountId],
  );
  const excess = live.length + 1 - account.max_active_users;
  if (excess <= 0) return;
  const mine = live.filter((session) => session.user_id === user.id);
  const others = live.filter((session) => session.user_id !== user.id);
  const [me] = await run<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
  const freed = [...mine, ...(me?.role === 'owner' ? others : [])].slice(0, excess);
  if (freed.length < excess)
    throw new SeatLimitError(
      [...new Set(others.map((session) => session.name))],
      account.max_active_users,
    );
  await run('DELETE FROM sessions WHERE account_id = $1 AND id = ANY($2::text[])', [
    user.accountId,
    freed.map((session) => session.id),
  ]);
}

/**
 * Abre uma sessão dentro de uma transação já no login do usuário
 * (app.auth_username): cada aparelho tem a sua, e só as já vencidas dele saem.
 * Ocupa uma vaga da loja ou lança SeatLimitError (a transação inteira volta).
 */
export async function insertSession(
  run: Query,
  user: Pick<StoreUser, 'id' | 'accountId'>,
  device: Device,
  upgradedHash?: string,
  deviceId?: string,
) {
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  await run('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [user.id]);
  await claimSeat(run, user);
  await run(
    `INSERT INTO sessions (
       token_hash, account_id, user_id, expires_at, user_agent, ip, device_id
     ) VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6, $7)`,
    [
      tokenHash,
      user.accountId,
      user.id,
      SESSION_SECONDS,
      device.userAgent.slice(0, 300),
      device.ip.slice(0, 80),
      deviceId ?? null,
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
  deviceId?: string,
) {
  return authTransaction(username, (run) =>
    insertSession(run, user, device, upgradedHash, deviceId),
  );
}

export async function upgradePasswordHash(run: Query, userId: string, upgradedHash: string) {
  await run('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    userId,
    upgradedHash,
  ]);
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

const abbreviatedIp = (ip: string) => {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return `${ip.split('.').slice(0, 3).join('.')}.xxx`;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}…`;
  return ip;
};

/** Os aparelhos conectados do usuário, este primeiro. */
export async function listOwnDevices(token: string) {
  return withOwnSession(token, async (run, { userId, tokenHash }) => {
    const rows = await run<{
      session_id: string;
      device_id: string | null;
      session_user_agent: string | null;
      session_ip: string | null;
      session_created_at: Timestamp;
      expires_at: Timestamp;
      current: boolean;
      device_user_agent: string | null;
      last_ip: string | null;
      last_seen_at: Timestamp | null;
      trusted_until: Timestamp | null;
      device_created_at: Timestamp | null;
    }>(
      `SELECT s.id AS session_id, s.device_id, s.user_agent AS session_user_agent,
              s.ip AS session_ip, s.created_at AS session_created_at, s.expires_at,
              s.token_hash = $2 AS current, d.user_agent AS device_user_agent,
              d.last_ip, d.last_seen_at, d.trusted_until,
              d.created_at AS device_created_at
       FROM sessions AS s
       LEFT JOIN auth_devices AS d ON d.id = s.device_id
       WHERE s.user_id = $1 AND s.expires_at > now()
       ORDER BY s.token_hash = $2 DESC, s.created_at DESC`,
      [userId, tokenHash],
    );
    const devices = new Map<string, StoreSession>();
    for (const row of rows) {
      const id = row.device_id ?? row.session_id;
      const saved = devices.get(id);
      if (saved) {
        saved.sessions += 1;
        saved.current ||= row.current;
        if (Date.parse(saved.expiresAt) < new Date(row.expires_at).getTime())
          saved.expiresAt = iso(row.expires_at);
        continue;
      }
      devices.set(id, {
        id,
        userAgent: row.device_user_agent ?? row.session_user_agent ?? '',
        ip: abbreviatedIp(row.last_ip ?? row.session_ip ?? ''),
        createdAt: iso(row.device_created_at ?? row.session_created_at),
        lastSeenAt: iso(row.last_seen_at ?? row.session_created_at),
        expiresAt: iso(row.expires_at),
        trustedUntil: row.trusted_until ? iso(row.trusted_until) : undefined,
        sessions: 1,
        current: row.current,
      });
    }
    const remembered = await run<{
      id: string;
      user_agent: string;
      last_ip: string;
      last_seen_at: Timestamp;
      trusted_until: Timestamp;
      created_at: Timestamp;
    }>(
      `SELECT d.id, d.user_agent, d.last_ip, d.last_seen_at, d.trusted_until, d.created_at
       FROM auth_devices AS d
       WHERE d.user_id = $1 AND d.trusted_until > now()
         AND NOT EXISTS (
           SELECT 1 FROM sessions AS s
           WHERE s.device_id = d.id AND s.expires_at > now()
         )`,
      [userId],
    );
    for (const row of remembered)
      devices.set(row.id, {
        id: row.id,
        userAgent: row.user_agent,
        ip: abbreviatedIp(row.last_ip),
        createdAt: iso(row.created_at),
        lastSeenAt: iso(row.last_seen_at),
        expiresAt: iso(row.trusted_until),
        trustedUntil: iso(row.trusted_until),
        sessions: 0,
        current: false,
      });
    return [...devices.values()].sort(
      (left, right) =>
        Number(right.current) - Number(left.current) ||
        Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt),
    );
  });
}

/** Compatibilidade para chamadores existentes; a resposta agora é agrupada por aparelho. */
export const listOwnSessions = listOwnDevices;

export async function revokeOwnDevice(token: string, deviceId: string) {
  return withOwnSession(token, async (run, { userId, tokenHash }) => {
    const linked = await run<{ current: boolean }>(
      `SELECT token_hash = $3 AS current FROM sessions
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId, tokenHash],
    );
    const deleted = await run(
      'DELETE FROM auth_devices WHERE id = $1 AND user_id = $2 RETURNING id',
      [deviceId, userId],
    );
    if (deleted.length) return { ended: linked.length, current: linked.some((row) => row.current) };
    const legacy = await run<{ current: boolean }>(
      `DELETE FROM sessions
       WHERE id = $1 AND user_id = $2 AND device_id IS NULL
       RETURNING token_hash = $3 AS current`,
      [deviceId, userId, tokenHash],
    );
    return legacy.length ? { ended: 1, current: legacy[0].current } : null;
  });
}

/** Encerra um aparelho do próprio usuário. */
export async function endOwnSession(token: string, sessionId: string) {
  return Boolean(await revokeOwnDevice(token, sessionId));
}

/** "Sair dos outros aparelhos": fica só este. */
export async function endOtherOwnSessions(token: string) {
  return withOwnSession(token, async (run, { userId, tokenHash }) => {
    const [current] = await run<{ device_id: string | null }>(
      'SELECT device_id FROM sessions WHERE user_id = $1 AND token_hash = $2',
      [userId, tokenHash],
    );
    const [{ count }] = await run<{ count: string | number }>(
      'SELECT count(*) AS count FROM sessions WHERE user_id = $1 AND token_hash <> $2',
      [userId, tokenHash],
    );
    await run(
      `DELETE FROM auth_devices
       WHERE user_id = $1 AND ($2::text IS NULL OR id <> $2)`,
      [userId, current?.device_id ?? null],
    );
    await run('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash]);
    return Number(count);
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
