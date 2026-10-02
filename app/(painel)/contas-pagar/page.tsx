import PayablesRoute from '@/components/payables-route';
import * as payables from '@/lib/repos/payables';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PayablesPage() {
  const account = await requireServerAccount();
  return <PayablesRoute initialPayables={await payables.list(account.id)} />;
}
