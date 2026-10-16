import { redirect } from 'next/navigation';
import AccountsRoute from '@/components/accounts-route';
import { adminTransaction } from '@/lib/db';
import { listStores } from '@/lib/repos/accounts';
import { listMfaResetRequests } from '@/lib/repos/auth-security';
import { listPasswordRequests } from '@/lib/repos/users';
import { requireServerAccount } from '@/lib/server-auth';

export default async function AccountsPage() {
  const account = await requireServerAccount();
  if (account.role !== 'admin') redirect('/');
  const actor = { id: account.id, role: 'admin' as const };
  const [stores, requests, mfaRequests] = await Promise.all([
    listStores(actor),
    adminTransaction(actor, (run) => listPasswordRequests(run, { role: 'owner' })),
    adminTransaction(actor, (run) => listMfaResetRequests(run, { role: 'owner' })),
  ]);
  return (
    <AccountsRoute
      initialMfaRequests={mfaRequests}
      initialRequests={requests}
      initialStores={stores}
    />
  );
}
