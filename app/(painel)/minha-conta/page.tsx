import { headers } from 'next/headers';
import MyAccountRoute from '@/components/my-account-route';
import { pendingEmail } from '@/lib/access';
import { sessionToken } from '@/lib/auth';
import { emailConfigured } from '@/lib/email';
import { authEncryptionConfigured } from '@/lib/env';
import { ownSecuritySummary } from '@/lib/repos/auth-security';
import { listOwnDevices } from '@/lib/repos/sessions';
import { requireServerAccount } from '@/lib/server-auth';

export default async function MyAccountPage() {
  const account = await requireServerAccount();
  const token = sessionToken(
    new Request('https://reparosm.local', { headers: new Headers(await headers()) }),
  );
  const [devices, pending, security] = token
    ? await Promise.all([listOwnDevices(token), pendingEmail(token), ownSecuritySummary(token)])
    : [[], null, null];
  return (
    <MyAccountRoute
      emailEnabled={emailConfigured()}
      initialPendingEmail={pending}
      initialSecurity={{
        totpEnabled: security?.totpEnabled ?? false,
        googleIdentity: security?.googleIdentity ?? null,
        recoveryCodesRemaining: security?.recoveryCodesRemaining ?? 0,
        devices: devices ?? [],
      }}
      initialUser={account.user}
      storeName={account.name}
      totpAvailable={authEncryptionConfigured()}
    />
  );
}
