import DataToolsRoute from '@/components/data-tools-route';
import { filmCatalog } from '@/lib/film-catalog';
import { tableRepos } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function DataPage() {
  const account = await requireServerAccount();
  const records = (
    await Promise.all(Object.values(tableRepos).map((repo) => repo!.list(account.id)))
  ).flat();
  const catalog = filmCatalog.map((record) => ({ ...record, type: 'film' as const }));
  return <DataToolsRoute records={[...records, ...catalog]} />;
}
