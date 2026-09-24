import ReportRoute from '@/components/report-route';
import { tableRepos } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function RelatorioPage() {
  const account = await requireServerAccount();
  const records = (
    await Promise.all(Object.values(tableRepos).map((repo) => repo!.list(account.id)))
  ).flat();
  return <ReportRoute initialRecords={records} />;
}
