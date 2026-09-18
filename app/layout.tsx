import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ReparoSM | Repair System Master',
  description: 'Controle produtos, serviços, estoque, clientes e resultados da sua assistência técnica em um só lugar.',
  openGraph: {
    title: 'ReparoSM | Repair System Master',
    description: 'Produtos, ordens de serviço, estoque e resultados em um só lugar.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReparoSM | Repair System Master',
    description: 'Produtos, ordens de serviço, estoque e resultados em um só lugar.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
