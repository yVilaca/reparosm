import { connection } from 'next/server';
import { Suspense } from 'react';
import LoginScreen from '@/components/login-screen';
import { googleConfigured } from '@/lib/env';

export default async function LoginPage() {
  // Google envs are read per request, so enabling them needs no rebuild.
  await connection();
  return (
    <Suspense>
      <LoginScreen googleEnabled={googleConfigured()} />
    </Suspense>
  );
}
