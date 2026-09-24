import AfterSalesRoute from '@/components/after-sales-route';
import { clients, messages, orders, shops } from '@/lib/repos';
import { automations } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';

export default async function AfterSalesPage() {
  const account = await requireServerAccount();
  const [automationRecords, messageRecords, clientRecords, orderRecords, shopRecords] =
    await Promise.all([
      automations.list(account.id),
      messages.list(account.id),
      clients.list(account.id),
      orders.list(account.id),
      shops.list(account.id),
    ]);
  return (
    <AfterSalesRoute
      initialAutomations={automationRecords.map((record) => ({ id: record.id, ...record.data }))}
      initialMessages={messageRecords.map((record) => ({ id: record.id, ...record.data }))}
      clients={clientRecords.map((record) => ({ id: record.id, ...record.data }))}
      orders={orderRecords.map((record) => ({ id: record.id, ...record.data }))}
      shop={shopRecords[0]?.data}
    />
  );
}
