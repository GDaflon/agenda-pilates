'use client';

import { AppProvider, useApp } from '@/lib/appState';
import { ShellHeader, ShellNav } from '@/components/Shell';

function Corpo({ children }: { children: React.ReactNode }) {
  const { pronto } = useApp();
  if (!pronto) {
    return <div className="spin-center">Carregando a agenda…</div>;
  }
  return (
    <div className="app-shell">
      <ShellHeader />
      <main className="app-main">{children}</main>
      <ShellNav />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Corpo>{children}</Corpo>
    </AppProvider>
  );
}
