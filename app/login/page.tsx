import { Suspense } from 'react';
import LoginScreen from '@/components/login-screen';
import { googleConfigured } from '@/lib/env';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen googleEnabled={googleConfigured()} />
    </Suspense>
  );
}
