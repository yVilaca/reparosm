import PayablesRoute from '@/components/payables-route';
import * as payables from '@/lib/repos/payables';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ pagar?: string | string[] }>;
}) {
  const account = await requireServerAccount();
  const { pagar } = await searchParams;
  return (
    <PayablesRoute
      initialPayables={await payables.list(account.id)}
      payId={typeof pagar === 'string' ? pagar : undefined}
    />
  );
}
