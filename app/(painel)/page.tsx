import DashboardRoute, { dashboardPeriods } from '@/components/dashboard-route';

import * as cash from '@/lib/repos/cash';

import * as dashboard from '@/lib/repos/dashboard';

import { monthForecast } from '@/lib/repos/forecast';

import { requireServerAccount } from '@/lib/server-auth';

import { todayInSaoPaulo } from '@/lib/warranty';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const account = await requireServerAccount();

  const asOfDate = todayInSaoPaulo();

  const { periodo } = await searchParams;
  const period =
    dashboardPeriods.find((item) => item.value === periodo)?.value ?? dashboardPeriods[0].value;

  const [actions, bench, today, periodTotals, orderTotals, trend, forecast] = await Promise.all([
    dashboard.actions(account.id, asOfDate),

    dashboard.bench(account.id),

    cash.today(account.id, asOfDate),

    cash.periodTotals(account.id, period, asOfDate),
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

      period={period}

      periodTotals={periodTotals}

      today={today}
      trend={trend}
    />
  );
}
