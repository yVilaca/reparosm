import ReceivablesRoute from '@/components/receivables-route';
import * as cash from '@/lib/repos/cash';
import { requireServerAccount } from '@/lib/server-auth';

export default async function ReceivablesPage() {
  const account = await requireServerAccount();
  const summary = await cash.receivables(account.id);
  return (
    <ReceivablesRoute
      pending={summary.pending}
      ready={summary.ready}
      inProgress={summary.inProgress}
    />
  );
}
