import DashboardRoute from '@/components/dashboard-route';
import * as cash from '@/lib/repos/cash';
import { clients, messages, orders, parts, quotes } from '@/lib/repos';
import { expenses, payments } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';

export default async function DashboardPage() {
  const account = await requireServerAccount();
  const [
    orderRecords,
    quoteRecords,
    partRecords,
    clientRecords,
    paymentRecords,
    expenseRecords,
    messageRecords,
    monthTotals,
  ] = await Promise.all([
    orders.list(account.id),
    quotes.list(account.id),
    parts.list(account.id),
    clients.list(account.id),
    payments.list(account.id),
    expenses.list(account.id),
    messages.list(account.id),
    cash.month(account.id),
  ]);
  return (
    <DashboardRoute
      orders={orderRecords.map((record) => ({ id: record.id, ...record.data }))}
      quotes={quoteRecords.map((record) => ({ id: record.id, ...record.data }))}
      parts={partRecords.map((record) => ({ id: record.id, ...record.data }))}
      clients={clientRecords.map((record) => ({ id: record.id, ...record.data }))}
      payments={paymentRecords.map((record) => ({ id: record.id, ...record.data }))}
      expenses={expenseRecords.map((record) => ({ id: record.id, ...record.data }))}
      messages={messageRecords.map((record) => ({ id: record.id, ...record.data }))}
      monthlyRevenue={monthTotals.current.income}
    />
  );
}
