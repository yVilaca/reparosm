import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Página de um aparelho só: fora de buscadores e sem mandar o endereço adiante.
export const metadata: Metadata = {
  title: 'Teste do aparelho',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// O teste de toque usa a tela inteira: sem zoom por gesto.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function DeviceTestLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[var(--canvas)]">{children}</div>;
}
