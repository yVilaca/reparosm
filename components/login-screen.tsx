'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Login, { type LoginMode } from '@/components/login';

export default function LoginScreen({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const initialMode: LoginMode =
    search.get('etapa') === 'verificacao' ? 'mfa' : search.has('esqueci') ? 'forgot' : 'login';
  return (
    <Login
      googleEnabled={googleEnabled}
      initialError={
        search.get('erro') === 'google'
          ? 'Não foi possível entrar com Google.'
          : search.get('erro') === 'vagas'
            ? `${search.has('senha') ? 'Senha criada. ' : ''}A loja já está com todas as vagas de acesso em uso. Peça para alguém sair ou fale com o dono da loja.`
            : ''
      }
      initialMode={initialMode}
      onLogin={(account) =>
        router.replace(account.user?.mustChangePassword ? '/minha-conta#senha' : '/ordens')
      }
    />
  );
}
