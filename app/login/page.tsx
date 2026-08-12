'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRepo } from '@/lib/getRepo';
import { isDemoMode } from '@/lib/repo';

export default function LoginPage() {
  const router = useRouter();
  const demo = isDemoMode();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // já logado? vai direto
  useEffect(() => {
    getRepo()
      .sessionInfo()
      .then((s) => {
        if (s && !demo) router.replace('/');
      })
      .catch(() => {});
  }, [router, demo]);

  async function entrar(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(null);
    setCarregando(true);
    const msg = await getRepo().login(email.trim(), senha);
    if (msg) {
      setErro(msg);
      setCarregando(false);
      return;
    }
    router.replace('/');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          Agenda <span>Pilates</span>
        </h1>
        <p className="login-sub">Agenda digital das clínicas — equipe</p>

        {demo ? (
          <>
            <p className="section-note" style={{ textAlign: 'center' }}>
              Rodando em <b>modo demonstração</b> (dados fictícios, nada é salvo). Para usar de
              verdade, configure o Supabase — veja o README.
            </p>
            <button className="btn" onClick={() => router.replace('/')}>
              Entrar na demonstração
            </button>
          </>
        ) : (
          <form onSubmit={entrar}>
            <span className="field-label">E-mail</span>
            <input
              className="field"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="field-label">Senha</span>
            <input
              className="field"
              type="password"
              value={senha}
              autoComplete="current-password"
              onChange={(e) => setSenha(e.target.value)}
            />
            {erro && <div className="erro-box">{erro}</div>}
            <button className="btn" type="submit" disabled={carregando || !email || !senha}>
              {carregando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
