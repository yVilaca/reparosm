// Local-only route benchmark; uses a temporary session and removes it when finished.
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());
const base = new URL(process.env.PERFORMANCE_URL || 'http://127.0.0.1:3108');
const dbUrl = new URL(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
if (
  ![base.hostname, dbUrl.hostname].every((host) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(host),
  )
)
  throw new Error('This probe only supports local servers and databases.');
const { migrationQuery, closeMigrationDatabase } = await import('./migration-db.mjs');
const { createSession, deleteSession } = await import('../lib/repos/sessions.ts');
const { closeDatabase } = await import('../lib/db.ts');
let token;
try {
  const [account] =
    await migrationQuery(`SELECT id, username FROM accounts WHERE status = 'active' AND role = 'merchant'
    ORDER BY (SELECT count(*) FROM orders WHERE account_id = accounts.id) DESC LIMIT 1`);
  if (!account) throw new Error('No active local merchant to benchmark.');
  token = await createSession(account.username, account.id);
  for (const route of [
    '/',
    '/ordens',
    '/clientes',
    '/estoque',
    '/peliculas',
    '/orcamentos',
    '/pagamentos',
    '/contas-pagar',
    '/compras',
    '/garantias',
    '/pos-venda',
    '/minha-assistencia',
    '/dados',
    '/assistente',
    '/suporte',
  ]) {
    const samples = [];
    let bytes = 0;
    for (let index = 0; index < 4; index++) {
      const start = performance.now();
      const response = await fetch(new URL(route, base), {
        headers: { cookie: `reparosm_session=${token}` },
        redirect: 'manual',
      });
      const body = await response.arrayBuffer();
      if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
      bytes = body.byteLength;
      if (index) samples.push(Math.round(performance.now() - start));
    }
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ route, medianMs: samples[1], bytes }));
  }
} finally {
  if (token) await deleteSession(token);
  await closeDatabase();
  await closeMigrationDatabase();
}
