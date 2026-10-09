'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SoftBanner from '@/components/ui/soft-banner';

/** Lembrete em todas as telas enquanto a pessoa usa uma senha provisória. */
export default function ProvisionalPasswordBanner() {
  // Minha conta já mostra o aviso junto do formulário de senha.
  if (usePathname() === '/minha-conta') return null;
  return (
    <SoftBanner
      action={
        <Button asChild size="sm">
          <Link href="/minha-conta#senha">Criar minha senha</Link>
        </Button>
      }
      className="mb-6 print:hidden"
      description="Ela foi definida por outra pessoa. Crie a sua para continuar com segurança."
      icon={KeyRound}
      title="Você está usando uma senha provisória"
      tone="warning"
    />
  );
}
