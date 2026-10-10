import pg from 'pg';
import { env } from '@/lib/env';

export type Row = Record<string, unknown>;
export type Query = <R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>;
type Transaction = <T>(fn: (query: Query) => Promise<T>) => Promise<T>;
type ScopedTransaction = <T>(scope: string, fn: (query: Query) => Promise<T>) => Promise<T>;
export type AdminActor = Readonly<{ id: string; role: 'admin' }>;
type TenantQuery = <R extends Row = Row>(
  accountId: string,
  text: string,
  params?: unknown[],
) => Promise<R[]>;

// Connect lazily: Next.js imports this module while collecting build metadata.
let connection: pg.Pool | undefined;
const database = () => {
  if (connection) return connection;
  if (!env.databaseUrl) throw new Error('DATABASE_URL não está configurada.');
  connection = new pg.Pool({ connectionString: env.databaseUrl });
  // An idle pooled client can drop (e.g. a frozen function); don't let that crash the process.
  connection.on('error', (error: Error) => console.error('Database pool error', error));
  return connection;
};

async function runAsRuntime<T>(
  fn: (query: Query) => Promise<T>,
  setting?: readonly [string, string],
) {
  let client: pg.PoolClient | undefined;
  try {
    client = await database().connect();
    const activeClient = client;
    const run: Query = async <R extends Row>(text: string, params: unknown[] = []) =>
      (await activeClient.query(text, params)).rows as R[];
    await client.query('BEGIN; SET LOCAL ROLE reparosm_runtime');
    if (setting) await run('SELECT set_config($1, $2, true)', [...setting]);
    const result = await fn(run);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

/** Runs a statement as the restricted app role, with no tenant context. */
export const query: Query = async <R extends Row>(text: string, params: unknown[] = []) =>
  runAsRuntime((run) => run<R>(text, params));

/** Runs app queries in a short transaction under the restricted role. */
export const transaction: Transaction = (fn) => runAsRuntime(fn);

function requiredContext(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} não pode ser vazio.`);
  return value;
}

/** Runs related tenant queries with an account setting local to this transaction. */
export const tenantTransaction: ScopedTransaction = (accountId, fn) =>
  runAsRuntime(fn, ['app.account_id', requiredContext(accountId, 'accountId')]);

/** Switches the current restricted transaction to a DB-derived tenant context. */
export async function setTenantContext(run: Query, accountId: string) {
  await run('SELECT set_config($1, $2, true)', [
    'app.account_id',
    requiredContext(accountId, 'accountId'),
  ]);
}

/** Runs read-only public storefront queries with a store-specific capability. */
export const publicStoreTransaction: ScopedTransaction = (accountId, fn) =>
  runAsRuntime(fn, ['app.public_store_account_id', requiredContext(accountId, 'accountId')]);

/** Runs a public quote lookup/response with access to exactly its bearer quote ID. */
export const publicQuoteTransaction: ScopedTransaction = (quoteId, fn) =>
  runAsRuntime(fn, ['app.public_quote_id', requiredContext(quoteId, 'quoteId')]);

/** Runs authentication queries with access to one normalized username. */
export const authTransaction: ScopedTransaction = (username, fn) =>
  runAsRuntime(fn, ['app.auth_username', requiredContext(username, 'username')]);

export async function authQuery<R extends Row = Row>(
  username: string,
  text: string,
  params: unknown[] = [],
) {
  return authTransaction(username, (run) => run<R>(text, params));
}

/** Runs a lookup by e-mail with access to the one user that has it (login, forgot password). */
export const authEmailTransaction: ScopedTransaction = (email, fn) =>
  runAsRuntime(fn, ['app.auth_email', requiredContext(email, 'email')]);

/**
 * Switches the current transaction to one user's login scope, after the caller
 * derived that username from a validated row (e.g. an access link).
 */
export async function setAuthUsernameContext(run: Query, username: string) {
  await run('SELECT set_config($1, $2, true)', [
    'app.auth_username',
    requiredContext(username, 'username'),
  ]);
}

/** Runs access-link queries with access to exactly one SHA-256 token hash. */
export const accessLinkTransaction: ScopedTransaction = (tokenHash, fn) => {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('access link hash inválido.');
  return runAsRuntime(fn, ['app.access_link_hash', tokenHash]);
};

/** Runs session lookups with access to one SHA-256 token hash. */
export const sessionTransaction: ScopedTransaction = (tokenHash, fn) => {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('session token hash inválido.');
  return runAsRuntime(fn, ['app.session_token_hash', tokenHash]);
};

/**
 * Sets the account and user scope only after checking them against the active
 * session row. Returns the session's user.
 */
export async function setSessionAccountContext(run: Query, accountId: string) {
  const [session] = await run<{ account_id: string; user_id: string }>(
    `SELECT set_config('app.session_account_id', account_id, true) AS account_id,
            set_config('app.session_user_id', user_id, true) AS user_id
     FROM sessions
     WHERE token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
       AND account_id = $1
       AND expires_at > now()`,
    [requiredContext(accountId, 'accountId')],
  );
  if (!session || session.account_id !== accountId) throw new Error('session account mismatch.');
  return session.user_id;
}

/** Runs lockout queries with access to one exact username/IP pair. */
export const loginFailureTransaction = <T>(
  username: string,
  ip: string,
  fn: (query: Query) => Promise<T>,
) =>
  runAsRuntime(
    async (run) => {
      await run('SELECT set_config($1, $2, true)', ['app.login_ip', requiredContext(ip, 'ip')]);
      return fn(run);
    },
    ['app.auth_username', requiredContext(username, 'username')],
  );

/** Runs one lockout query with its exact username/IP pair. */
export async function loginFailureQuery<R extends Row = Row>(
  username: string,
  ip: string,
  text: string,
  params: unknown[] = [],
) {
  return loginFailureTransaction(username, ip, (run) => run<R>(text, params));
}

/** Runs related queries with a server-verified, currently active administrator identity. */
export async function adminTransaction<T>(actor: AdminActor, fn: (query: Query) => Promise<T>) {
  if (actor?.role !== 'admin') throw new Error('admin actor required.');
  const id = requiredContext(actor.id, 'admin id');
  return runAsRuntime(
    async (run) => {
      const [admin] = await run<{ id: string }>(
        `SELECT id FROM accounts WHERE id = $1 AND role = 'admin' AND status = 'active'`,
        [id],
      );
      if (!admin) throw new Error('admin actor required.');
      return fn(run);
    },
    ['app.admin_account_id', id],
  );
}

/** Runs a query with a server-verified, currently active administrator identity. */
export async function adminQuery<R extends Row = Row>(
  actor: AdminActor,
  text: string,
  params: unknown[] = [],
): Promise<R[]> {
  return adminTransaction(actor, (run) => run<R>(text, params));
}

export const tenantQuery: TenantQuery = async <R extends Row>(
  accountId: string,
  text: string,
  params: unknown[] = [],
) => tenantTransaction(accountId, (run) => run<R>(text, params));

/** Uses an existing transaction query when supplied; otherwise creates a scoped query runner. */
export function tenantQueryFor(accountId: string, run?: Query): Query {
  if (run) return run;
  return <R extends Row>(text: string, params: unknown[] = []) =>
    tenantQuery<R>(accountId, text, params);
}

/** Closes the pool so scripts and tests can exit. */
export async function closeDatabase() {
  const current = connection;
  connection = undefined;
  await current?.end();
}
