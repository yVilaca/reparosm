'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Login from '@/components/login';

function LoginScreen() {
  const router = useRouter();
  const startForgot = useSearchParams().has('esqueci');
  // Senha provisória (definida pelo dono ou pelo suporte): primeiro, criar a própria.
  return (
    <Login
      startForgot={startForgot}
      onLogin={(account) =>
        router.replace(account.user?.mustChangePassword ? '/minha-conta#senha' : '/ordens')
      }
    />
  );
}

// useSearchParams pede um limite de Suspense na página.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
