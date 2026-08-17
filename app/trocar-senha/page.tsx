'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRepo } from '@/lib/getRepo';

/* Primeiro acesso com senha temporária: o AppProvider manda para cá
   antes de liberar qualquer aba. Troca a senha (mín. 8 caracteres),
   zera a flag no perfil e segue para a agenda. */

export default function TrocarSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // sem sessão não há o que trocar — volta para o login
  useEffect(() => {
    getRepo()
      .sessionInfo()
      .then((s) => {
        if (!s) router.replace('/login');
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function trocar(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirma) {
      setErro('As senhas não conferem.');
      return;
    }
    setSalvando(true);
    const msg = await getRepo().trocarSenha(senha);
    if (msg) {
      setErro(msg);
      setSalvando(false);
      return;
    }
    router.replace('/');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          <span>Natty</span> Pilates
        </h1>
        <p className="login-sub">Primeiro acesso — crie sua senha definitiva</p>
        <p className="section-note" style={{ textAlign: 'center' }}>
          Você entrou com uma senha temporária. Escolha uma nova (mínimo 8 caracteres) para
          continuar.
        </p>

        <form onSubmit={trocar}>
          <span className="field-label">Nova senha</span>
          <input
            className="field"
            type="password"
            value={senha}
            autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)}
          />
          <span className="field-label">Confirmar a nova senha</span>
          <input
            className="field"
            type="password"
            value={confirma}
            autoComplete="new-password"
            onChange={(e) => setConfirma(e.target.value)}
          />
          {erro && <div className="erro-box">{erro}</div>}
          <button className="btn" type="submit" disabled={salvando || !senha || !confirma}>
            {salvando ? 'Salvando…' : 'Salvar e entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
