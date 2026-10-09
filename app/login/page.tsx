'use client';

import { useRouter } from 'next/navigation';
import Login from '@/components/login';

export default function LoginPage() {
  const router = useRouter();
  // Senha provisória (definida pelo dono ou pelo suporte): primeiro, criar a própria.
  return (
    <Login
      onLogin={(account) =>
        router.replace(account.user?.mustChangePassword ? '/minha-conta#senha' : '/ordens')
      }
    />
  );
}
