import { getDatabase, type DatabaseConnection } from '@netlify/database';
import { env } from '@/lib/env';

export type Row = Record<string, unknown>;
export type Query = <R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>;
type Transaction = <T>(fn: (query: Query) => Promise<T>) => Promise<T>;
type ScopedTransaction = <T>(scope: string, fn: (query: Query) => Promise<T>) => Promise<T>;
type TenantQuery = <R extends Row = Row>(
  accountId: string,
  text: string,
  params?: unknown[],
) => Promise<R[]>;

// getDatabase() builds a new pool on every call, so keep one connection per server instance.
// Connect lazily: Next.js imports this module while collecting build metadata.
let connection: DatabaseConnection | undefined;
const database = () => {
  if (connection) return connection;
  connection = env.databaseUrl ? getDatabase({ connectionString: env.databaseUrl }) : getDatabase();
  // An idle pooled client can drop (e.g. a frozen function); don't let that crash the process.
  connection.pool.on('error', (error: Error) => console.error('Database pool error', error));
  return connection;
};

async function runAsRuntime<T>(
  fn: (query: Query) => Promise<T>,
  setting?: readonly [string, string],
) {
  let client: Awaited<ReturnType<DatabaseConnection['pool']['connect']>> | undefined;
  try {
    client = await database().pool.connect();
    const activeClient = client;
    const run: Query = async <R extends Row>(text: string, params: unknown[] = []) =>
      (await activeClient.query(text, params)).rows as R[];
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE reparosm_runtime');
    if (setting) await run('SELECT set_config($1, $2, true)', [...setting]);
    const result = await fn(run);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    const databaseError = error as { code?: unknown; message?: unknown };
    if (
      !client ||
      (typeof databaseError.code === 'string' && /^[0-9A-Z]{5}$/.test(databaseError.code))
    )
      console.error('Database transaction failed', {
        code: typeof databaseError.code === 'string' ? databaseError.code : undefined,
        message:
          typeof databaseError.message === 'string'
            ? databaseError.message
            : error instanceof Error
              ? error.name
              : 'unknown',
      });
    if (
      client &&
      error instanceof Error &&
      /^permission denied to set role "reparosm_runtime"$/.test(error.message)
    ) {
      const [identity] = await client
        .query('SELECT current_user, session_user')
        .then(({ rows }: { rows: Row[] }) => rows)
        .catch(() => []);
      if (identity)
        console.error('Database principal cannot assume reparosm_runtime', {
          currentUser: identity.current_user,
          sessionUser: identity.session_user,
        });
    }
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
  await current?.pool.end();
}
