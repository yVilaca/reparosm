import DashboardRoute from '@/components/dashboard-route';
import * as cash from '@/lib/repos/cash';
import * as dashboard from '@/lib/repos/dashboard';
import { requireServerAccount } from '@/lib/server-auth';
import { todayInSaoPaulo } from '@/lib/warranty';

export default async function DashboardPage() {
  const account = await requireServerAccount();
  const asOfDate = todayInSaoPaulo();
  const [actions, bench, today, movements, month] = await Promise.all([
    dashboard.actions(account.id, asOfDate),
    dashboard.bench(account.id),
    cash.today(account.id, asOfDate),
    cash.history(account.id, 'today', asOfDate),
    cash.month(account.id, asOfDate),
  ]);
  return (
    <DashboardRoute
      actions={actions}
      asOfDate={asOfDate}
      bench={bench}
      month={month}
      movements={movements}
      today={today}
    />
  );
}
