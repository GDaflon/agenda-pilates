'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/appState';
import { dateFor, ddmm, labelDia, DIAS_ABR } from '@/lib/dates';

const ABAS = [
  { href: '/', ico: '📅', lbl: 'Agenda' },
  { href: '/mes', ico: '🗓️', lbl: 'Mês' },
  { href: '/vagas', ico: '📣', lbl: 'Vagas' },
  { href: '/assistente', ico: '✨', lbl: 'Assistente' },
  { href: '/alunos', ico: '👥', lbl: 'Alunos' },
  { href: '/config', ico: '⚙️', lbl: 'Config' },
] as const;

export function ShellHeader() {
  const { repo, unidades, unidade, setUnidadeId, off, setOff, demo, sessao } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const mostraDias = pathname === '/' || pathname === '/vagas';
  const hoje = new Date();

  async function sair() {
    await repo.logout();
    router.replace('/login');
  }

  return (
    <header className="app-header">
      <div className="app-title">
        <h1>
          <span>Natty</span> Pilates
        </h1>
        <div className="header-right">
          {demo ? (
            <span className="mode-tag">✦ demonstração</span>
          ) : (
            <span>{sessao?.nome ?? ''}</span>
          )}
          <div>{DIAS_ABR[hoje.getDay()]}, {ddmm(hoje)}</div>
        </div>
        {!demo && (
          <button className="logout-btn" onClick={sair} aria-label="Sair da conta" title="Sair da conta">
            ⏻
          </button>
        )}
      </div>

      <div className="units">
        {unidades.map((u) => (
          <button
            key={u.id}
            className={`unit-pill ${unidade?.id === u.id ? 'active' : ''}`}
            onClick={() => setUnidadeId(u.id)}
          >
            {u.nome}
          </button>
        ))}
      </div>

      {mostraDias && (
        <div className="days">
          {[0, 1, 2].map((o) => (
            <button
              key={o}
              className={`day-pill ${off === o ? 'active' : ''}`}
              onClick={() => setOff(o)}
            >
              <div className="d1">{labelDia(o)}</div>
              <div className="d2">{ddmm(dateFor(o))}</div>
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

export function ShellNav() {
  const pathname = usePathname();
  const { sessao } = useApp();
  // a aba Config é exclusiva do papel dono
  const abas = ABAS.filter((a) => a.href !== '/config' || sessao?.papel === 'dono');
  return (
    <nav className="app-nav">
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`nav-btn ${pathname === a.href ? 'active' : ''}`}
        >
          <span className="ico">{a.ico}</span>
          <span className="lbl">{a.lbl}</span>
        </Link>
      ))}
    </nav>
  );
}
