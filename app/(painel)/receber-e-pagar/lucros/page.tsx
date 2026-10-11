import FinanceTabs from '@/components/finance-tabs';
import ProfitForecast from '@/components/profit-forecast';
import PageHeader from '@/components/ui/page-header';
import { monthForecast } from '@/lib/repos/forecast';
import { requireServerAccount } from '@/lib/server-auth';

export default async function ProfitForecastPage() {
  const account = await requireServerAccount();
  const forecast = await monthForecast(account.id);
  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Onde o lucro do mês deve fechar, pelo ritmo da loja."
      />
      <FinanceTabs className="mb-6" current="profit" />
      <ProfitForecast forecast={forecast} />
    </>
  );
}
