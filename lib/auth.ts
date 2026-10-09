import { authTransaction } from '@/lib/db';
import { env, requiredEnv } from '@/lib/env';
import { accountForSession, deleteSession, SESSION_SECONDS } from '@/lib/repos/sessions';
import { normalizeUser, passwordHash, passwordProblem, verifyPassword } from '@/lib/security';
import type { SessionAccount } from '@/lib/types';
export { normalizeUser, passwordHash, passwordProblem, verifyPassword };
export type { SessionAccount };

async function setupAdmin() {
  await authTransaction('adminreparosm', async (run) => {
    const [admin] = await run<{ access_policy: string | null }>(
      `SELECT access_policy FROM accounts WHERE id = 'account-admin'`,
    );
    if (admin?.access_policy === 'admin-managed-v2') return;
    const hash = requiredEnv('ADMIN_PASSWORD_HASH', env.adminPasswordHash, /^pbkdf2\$/);
    // One-time migration requested by the owner: the administrator password comes from the
    // server environment; every other account and record is preserved.
    await run(
      `INSERT INTO accounts (id, username, name, role, status, plan, access_policy)
       VALUES ('account-admin', 'adminreparosm', 'Administrador', 'admin', 'active',
               'Administrador', 'admin-managed-v2')
       ON CONFLICT (id) DO UPDATE SET username = 'adminreparosm', role = 'admin',
         status = 'active', plan = 'Administrador', access_policy = 'admin-managed-v2',
         updated_at = now()`,
    );
    await run(
      `INSERT INTO users (id, account_id, username, name, role, status, password_hash)
       VALUES ('user-adminreparosm', 'account-admin', 'adminreparosm', 'Administrador',
               'owner', 'active', $1)
       ON CONFLICT (id) DO UPDATE SET role = 'owner', status = 'active', password_hash = $1,
         must_change_password = false, updated_at = now()`,
      [hash],
    );
    await run('DELETE FROM sessions WHERE account_id = $1', ['account-admin']);
  });
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

const cookie = (request: Request, name: string) =>
  request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const sessionToken = (request: Request) => cookie(request, 'reparosm_session');

/** The signed-in store and user for this request, or null if either is not active. */
export async function currentAccount(request: Request) {
  await ensureAdmin();
  const token = sessionToken(request);
  if (!token) return null;
  const account = await accountForSession(token);
  return account?.status === 'active' && account.user.status === 'active' ? account : null;
}

/** Dono da loja (o administrador também cuida da própria conta). */
export const isOwner = (account: SessionAccount) =>
  account.role === 'admin' || account.user.role === 'owner';

export async function endSession(request: Request) {
  const token = sessionToken(request);
  if (token) await deleteSession(token);
}

/** Client IP as reported by the edge, falling back to the proxy header. */
export const clientIp = (request: Request) =>
  request.headers.get('x-nf-client-connection-ip') ||
  request.headers.get('x-real-ip') ||
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
