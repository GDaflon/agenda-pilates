import type { Metadata, Viewport } from 'next';
import './globals.css';
import SWRegister from '@/components/SWRegister';

export const metadata: Metadata = {
  title: 'Natty Estúdio Pilates',
  description: 'Natty Estúdio Pilates — marcações, vagas e presença.',
  manifest: '/manifest.webmanifest',
  // Ícones vêm das convenções de arquivo do Next: app/icon.svg (aba do navegador)
  // e app/apple-icon.png (tela de início do iOS). NÃO declare metadata.icons aqui:
  // um icons explícito substitui a metadata gerada pelos arquivos e o ícone da aba
  // volta a sumir.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Natty Pilates',
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
