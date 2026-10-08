import type { Metadata } from 'next';
import { Inter, Red_Hat_Display } from 'next/font/google';
import { FeedbackProvider } from '@/components/feedback';
import { ThemeProvider } from '@/components/theme-provider';
import { env } from '@/lib/env';
import './globals.css';
import './print.css';
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
// Títulos e números de destaque, na mesma família geométrica do letreiro do logo.
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
    <html lang="pt-BR" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased font-sans print:bg-white print:text-black">
        <ThemeProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
