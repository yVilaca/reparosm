import TeamRoute from '@/components/team-route';
import { tenantTransaction } from '@/lib/db';
import { emailConfigured } from '@/lib/email';
import { listPasswordRequests, listUsers } from '@/lib/repos/users';
import { requireOwner } from '@/lib/server-auth';

export default async function TeamPage() {
  const account = await requireOwner();
  const { users, requests } = await tenantTransaction(account.id, async (run) => ({
    users: await listUsers(run, account.id),
    requests: await listPasswordRequests(run, { role: 'staff', accountId: account.id }),
  }));
  return (
    <TeamRoute
      emailEnabled={emailConfigured()}
      initialRequests={requests}
      initialUsers={users}
      selfId={account.user.id}
      storeName={account.name}
    />
  );
}
