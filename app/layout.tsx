import type { Metadata, Viewport } from 'next';
import './globals.css';
import SWRegister from '@/components/SWRegister';

export const metadata: Metadata = {
  title: 'Natty Estúdio Pilates',
  description: 'Natty Estúdio Pilates — marcações, vagas e presença.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Natty Pilates',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // comportamento de app instalado: iOS não pode "prender" zoom ao focar campos
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#C0267E',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR">
      <body>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
