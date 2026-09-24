import FinanceRoute from '@/components/finance-route';
import { expenses, payments } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PaymentsPage() {
  const account = await requireServerAccount();
  const [paymentRecords, expenseRecords] = await Promise.all([
    payments.list(account.id),
    expenses.list(account.id),
  ]);
  return (
    <FinanceRoute
      initialPayments={paymentRecords.map((record) => ({ id: record.id, ...record.data }))}
      initialExpenses={expenseRecords.map((record) => ({ id: record.id, ...record.data }))}
    />
  );
}
