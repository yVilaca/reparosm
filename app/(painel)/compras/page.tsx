import PayablesRoute from '@/components/payables-route';
import * as payables from '@/lib/repos/payables';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PurchasesPage() {
  const account = await requireServerAccount();
  return (
    <PayablesRoute
      description="Registre peças, materiais e serviços comprados para a assistência."
      initialPayables={await payables.list(account.id)}
      mode="purchases"
      title="Compras"
    />
  );
}
