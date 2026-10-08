import type { Metadata } from 'next';
import { Red_Hat_Display, Red_Hat_Text } from 'next/font/google';
import { FeedbackProvider } from '@/components/feedback';
import { ThemeProvider } from '@/components/theme-provider';
import { env } from '@/lib/env';
import './globals.css';
import './print.css';
// Uma família só, a do letreiro do logo: Text para ler, Display para títulos e números.
const text = Red_Hat_Text({ subsets: ['latin'], variable: '--font-sans' });
const display = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display-family',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: 'ReparoSM | Repair System Master',
  description:
    'Controle produtos, serviços, estoque, clientes e resultados da sua assistência técnica em um só lugar.',
  openGraph: {
    title: 'ReparoSM | Repair System Master',
    description: 'Produtos, ordens de serviço, estoque e resultados em um só lugar.',
    images: ['/og.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReparoSM | Repair System Master',
    description: 'Produtos, ordens de serviço, estoque e resultados em um só lugar.',
    images: ['/og.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${text.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased font-sans print:bg-white print:text-black">
        <ThemeProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
