import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentAccount, isOwner } from '@/lib/auth';
import type { SessionAccount } from '@/lib/types';
import { cache } from 'react';

// React cache is scoped to the render request: layout/page share this lookup, never sessions.
export const requireServerAccount = cache(async (): Promise<SessionAccount> => {
  const request = new Request('https://reparosm.local', {
    headers: new Headers(await headers()),
  });
  const account = await currentAccount(request);
  if (!account) redirect('/login');
  return account;
});

/** Telas só do Dono (Equipe, dados da assistência, exportação). */
export async function requireOwner() {
  const account = await requireServerAccount();
  if (!isOwner(account)) redirect('/');
  return account;
}
