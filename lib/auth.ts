import { query } from '@/lib/db';
import { findAccountByUsername } from '@/lib/repos/accounts';
import {
  accountForSession,
  deleteSession,
  revokeSessions,
  SESSION_SECONDS,
} from '@/lib/repos/sessions';
import { normalizeUser, passwordHash, passwordProblem, verifyPassword } from '@/lib/security';
export { normalizeUser, passwordHash, passwordProblem, verifyPassword, revokeSessions };
export type { Account } from '@/lib/types';

export const publicAccount = <T extends { passwordHash?: string }>(account: T) => {
  const { passwordHash: _, ...safe } = account;
  return safe;
};

async function setupAdmin() {
  const [admin] = await query<{ access_policy: string | null }>(
    `SELECT access_policy FROM accounts WHERE id = 'account-admin'`,
  );
  if (admin?.access_policy === 'admin-managed-v2') return;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash?.startsWith('pbkdf2$')) throw new Error('Acesso administrativo não configurado.');
  // One-time migration requested by the owner: the administrator password comes from the
  // server environment; every other account and record is preserved.
  await query(
    `INSERT INTO accounts (id, username, name, role, status, password_hash, plan, access_policy)
     VALUES ('account-admin', 'adminreparosm', 'Administrador', 'admin', 'active', $1,
             'Administrador', 'admin-managed-v2')
     ON CONFLICT (id) DO UPDATE SET username = 'adminreparosm', role = 'admin',
       status = 'active', password_hash = $1, must_change_password = false,
       plan = 'Administrador', access_policy = 'admin-managed-v2', updated_at = now()`,
    [hash],
  );
  await revokeSessions('account-admin');
}

let adminReady: Promise<void> | undefined;
/** Makes sure the administrator account exists; checked once per server instance. */
export function ensureAdmin() {
  adminReady ??= setupAdmin().catch((error) => {
    adminReady = undefined;
    throw error;
  });
  return adminReady;
}

export async function accountByUsername(username: string) {
  return findAccountByUsername(username);
}

const cookie = (request: Request, name: string) =>
  request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/** The signed-in, active account for this request, or null. */
export async function currentAccount(request: Request) {
  await ensureAdmin();
  const token = cookie(request, 'reparosm_session');
  if (!token) return null;
  const account = await accountForSession(token);
  return account?.status === 'active' ? account : null;
}

export async function endSession(request: Request) {
  const token = cookie(request, 'reparosm_session');
  if (token) await deleteSession(token);
}

/** Client IP as reported by Netlify's edge, falling back to the proxy header. */
export const clientIp = (request: Request) =>
  request.headers.get('x-nf-client-connection-ip') ||
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  'unknown';

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin'),
    site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false;
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
export const sessionCookie = (token: string, maxAge = SESSION_SECONDS, secure = false) =>
  `reparosm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
