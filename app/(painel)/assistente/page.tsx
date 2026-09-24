import BusinessAssistantRoute from '@/components/business-assistant-route';
import { orders, parts } from '@/lib/repos';
import { payments } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';

export default async function BusinessAssistantPage() {
  const account = await requireServerAccount();
  const [orderRecords, partRecords, paymentRecords] = await Promise.all([
    orders.list(account.id),
    parts.list(account.id),
    payments.list(account.id),
  ]);
  return (
    <BusinessAssistantRoute
      orders={orderRecords.map((record) => ({ id: record.id, ...record.data }))}
      parts={partRecords.map((record) => ({ id: record.id, ...record.data }))}
      payments={paymentRecords.map((record) => ({ id: record.id, ...record.data }))}
    />
  );
}
