import SupportRoute from '@/components/support-route';
import { tutorials } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';

export default async function SupportPage() {
  const account = await requireServerAccount();
  const records = await tutorials.list(account.id);
  return (
    <SupportRoute initialTutorials={records.map((record) => ({ id: record.id, ...record.data }))} />
  );
}
