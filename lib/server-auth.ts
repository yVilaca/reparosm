import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentAccount, publicAccount } from '@/lib/auth';
import type { PublicAccount } from '@/lib/types';
import { cache } from 'react';

// React cache is scoped to the render request: layout/page share this lookup, never sessions.
export const requireServerAccount = cache(async (): Promise<PublicAccount> => {
  const request = new Request('https://reparosm.local', {
    headers: new Headers(await headers()),
  });
  const account = await currentAccount(request);
  if (!account) redirect('/login');
  return publicAccount(account) as PublicAccount;
});
