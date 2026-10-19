import TeamRoute from '@/components/team-route';
import { tenantTransaction } from '@/lib/db';
import { emailConfigured } from '@/lib/email';
import { listMfaResetRequests } from '@/lib/repos/auth-security';
import { listPasswordRequests, listUsers } from '@/lib/repos/users';
import { requireOwner } from '@/lib/server-auth';

export default async function TeamPage() {
  const account = await requireOwner();
  const { users, requests, mfaRequests } = await tenantTransaction(account.id, async (run) => ({
    users: await listUsers(run, account.id),
    requests: await listPasswordRequests(run, { role: 'staff', accountId: account.id }),
    mfaRequests: await listMfaResetRequests(run, { role: 'staff', accountId: account.id }),
  }));
  return (
    <TeamRoute
      emailEnabled={emailConfigured()}
      initialMfaRequests={mfaRequests}
      initialRequests={requests}
      initialUsers={users}
      maxActiveUsers={account.maxActiveUsers}
      selfId={account.user.id}
      storeName={account.name}
    />
  );
}
