import type { Metadata } from 'next';
import AccessRoute from '@/components/access-route';

// O link carrega um token: a página não manda o endereço a outros sites nem é indexada.
export const metadata: Metadata = {
  title: 'Acesso | ReparoSM',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function AccessPage() {
  return <AccessRoute />;
}
