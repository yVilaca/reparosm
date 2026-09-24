import { redirect } from 'next/navigation';
import AccountsRoute from '@/components/accounts-route';
import { publicAccount } from '@/lib/auth';
import { listAccounts, listPendingPasswordRequests } from '@/lib/repos/accounts';
import { requireServerAccount } from '@/lib/server-auth';
import type { PublicAccount } from '@/lib/types';

export default async function AccountsPage() {
  const account = await requireServerAccount();
  if (account.role !== 'admin') redirect('/');
  const [accounts, requests] = await Promise.all([listAccounts(), listPendingPasswordRequests()]);
  return (
    <AccountsRoute
      initialAccounts={accounts.map((item) => publicAccount(item) as PublicAccount)}
      initialRequests={requests}
    />
  );
}
