import FinanceRoute from '@/components/finance-route';
import * as cash from '@/lib/repos/cash';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PaymentsPage() {
  const account = await requireServerAccount();
  const [today, month, receivables, review, history] = await Promise.all([
    cash.today(account.id),
    cash.month(account.id),
    cash.receivables(account.id),
    cash.review(account.id),
    cash.history(account.id, 'today'),
  ]);
  return <FinanceRoute initialHistory={history} summary={{ today, month, receivables, review }} />;
}
