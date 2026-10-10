import { headers } from 'next/headers';
import MyAccountRoute from '@/components/my-account-route';
import { pendingEmail } from '@/lib/access';
import { sessionToken } from '@/lib/auth';
import { emailConfigured } from '@/lib/email';
import { listOwnSessions } from '@/lib/repos/sessions';
import { requireServerAccount } from '@/lib/server-auth';

export default async function MyAccountPage() {
  const account = await requireServerAccount();
  const token = sessionToken(
    new Request('https://reparosm.local', { headers: new Headers(await headers()) }),
  );
  const [sessions, pending] = token
    ? await Promise.all([listOwnSessions(token), pendingEmail(token)])
    : [[], null];
  return (
    <MyAccountRoute
      emailEnabled={emailConfigured()}
      initialPendingEmail={pending}
      initialSessions={sessions ?? []}
      initialUser={account.user}
      storeName={account.name}
    />
  );
}
