'use client';

import { ArrowDownUp, TrendingUp } from 'lucide-react';
import Segmented from '@/components/ui/segmented';
import { PROFIT_FORECAST_PATH, RECEIVE_PAY_PATH } from '@/lib/finance-paths';

export type FinanceSection = 'receive-pay' | 'profit';

/** Abas do Financeiro: cada uma é uma página. */
export default function FinanceTabs({
  current,
  className,
}: {
  current: FinanceSection;
  className?: string;
}) {
  return (
    <Segmented<FinanceSection>
      className={className}
      label="Seções do financeiro"
      options={[
        {
          value: 'receive-pay',
          label: 'Receber e pagar',
          icon: ArrowDownUp,
          href: RECEIVE_PAY_PATH,
        },
        {
          value: 'profit',
          label: 'Lucros projetados',
          icon: TrendingUp,
          href: PROFIT_FORECAST_PATH,
        },
      ]}
      value={current}
    />
  );
}
