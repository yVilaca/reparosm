import DataToolsRoute, { type ExportCounts } from '@/components/data-tools-route';
import { filmCatalog } from '@/lib/film-catalog';
import { tenantQuery } from '@/lib/db';
import { requireOwner } from '@/lib/server-auth';

// ponytail: só o Dono vê esta tela, mas a exportação lê pelas mesmas rotas que o
// Funcionário usa no dia a dia (ordens, clientes, caixa…), que seguem abertas a ele.
// Restringir a leitura em massa pediria rotas próprias de exportação.
export default async function DataPage() {
  const account = await requireOwner();
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
