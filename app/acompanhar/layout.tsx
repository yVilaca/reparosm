import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Página de um cliente só: fora de buscadores e sem mandar o endereço adiante.
export const metadata: Metadata = {
  title: 'Acompanhe seu serviço',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[var(--canvas)]">{children}</div>;
}
