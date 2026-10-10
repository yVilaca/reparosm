import DashboardRoute from '@/components/dashboard-route';

import * as cash from '@/lib/repos/cash';

import * as dashboard from '@/lib/repos/dashboard';

import { monthForecast } from '@/lib/repos/forecast';

import { requireServerAccount } from '@/lib/server-auth';

import { todayInSaoPaulo } from '@/lib/warranty';

export default async function DashboardPage() {
  const account = await requireServerAccount();

  const asOfDate = todayInSaoPaulo();

  const [actions, bench, today, orderTotals, trend, forecast] = await Promise.all([
    dashboard.actions(account.id, asOfDate),

    dashboard.bench(account.id),

    cash.today(account.id, asOfDate),

    cash.orderFinancialTotals(account.id),
    cash.trend(account.id, asOfDate),
    monthForecast(account.id, asOfDate),
  ]);

  return (
    <DashboardRoute
      actions={actions}

      asOfDate={asOfDate}

      bench={bench}

      forecast={forecast}

      orderTotals={orderTotals}

      today={today}
      trend={trend}
    />
  );
}
