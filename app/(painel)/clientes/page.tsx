import ClientsRoute from '@/components/clients-route';
import { clients } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function ClientsPage() {
  const account = await requireServerAccount();
  const records = await clients.list(account.id);
  return (
    <ClientsRoute initialClients={records.map((record) => ({ id: record.id, ...record.data }))} />
  );
}
