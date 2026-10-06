import FinanceRoute from '@/components/finance-route';
import * as cash from '@/lib/repos/cash';
import { requireServerAccount } from '@/lib/server-auth';
import { todayInSaoPaulo } from '@/lib/warranty';

export default async function PaymentsPage() {
  const account = await requireServerAccount();
  const asOfDate = todayInSaoPaulo();
  const [today, month, receivables, review, history] = await Promise.all([
    cash.today(account.id, asOfDate),
    cash.month(account.id, asOfDate),
    cash.receivables(account.id),
    cash.review(account.id),
    cash.history(account.id, 'today', asOfDate),
  ]);
  return (
    <FinanceRoute
      initialHistory={history}
      asOfDate={asOfDate}
      summary={{ today, month, receivables, review }}
    />
  );
}
