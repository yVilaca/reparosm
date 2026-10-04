import DataToolsRoute, { type ExportCounts } from '@/components/data-tools-route';
import { filmCatalog } from '@/lib/film-catalog';
import { tenantQuery } from '@/lib/db';
import { requireServerAccount } from '@/lib/server-auth';

export default async function DataPage() {
  const account = await requireServerAccount();
  const [counts] = await tenantQuery<ExportCounts>(
    account.id,
    `SELECT
    (SELECT count(*)::int FROM clients WHERE account_id = $1) AS client,
    (SELECT count(*)::int FROM orders WHERE account_id = $1) AS "order",
    (SELECT count(*)::int FROM cash_entries WHERE account_id = $1 AND kind = 'in') AS payment,
    (SELECT count(*)::int FROM cash_entries WHERE account_id = $1 AND kind = 'out') AS expense,
    (SELECT count(*)::int FROM parts WHERE account_id = $1) AS part,
    (SELECT count(*)::int FROM quotes WHERE account_id = $1) AS quote,
    (SELECT count(*)::int FROM films WHERE account_id = $1) AS film`,
    [account.id],
  );
  return <DataToolsRoute counts={{ ...counts, film: (counts.film || 0) + filmCatalog.length }} />;
}
