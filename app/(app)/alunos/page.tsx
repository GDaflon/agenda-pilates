'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/appState';
import { Aluno, TIPO_LABEL, TipoAluno } from '@/lib/types';
import { norm } from '@/lib/text';
import Badge from '@/components/Badge';
import AlunoSheet from '@/components/AlunoSheet';

type Filtro = 'todos' | TipoAluno;

export default function AlunosPage() {
  const { repo, refreshKey, toast } = useApp();
  const [alunos, setAlunos] = useState<Aluno[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [alvo, setAlvo] = useState<Aluno | 'novo' | null>(null);

  useEffect(() => {
    let vivo = true;
    repo
      .listAlunos()
      .then((a) => {
        if (vivo) setAlunos(a);
      })
      .catch((e) => toast('Erro ao carregar: ' + (e as Error).message));
    return () => {
      vivo = false;
    };
  }, [repo, refreshKey, toast]);

  const filtros: [Filtro, string][] = [
    ['todos', 'Todos'],
    ['mensalista', 'Mensalistas'],
    ['wellhub', 'Wellhub'],
    ['totalpass', 'TotalPass'],
  ];

  const q = norm(busca);
  const lista = (alunos ?? []).filter(
    (a) => (filtro === 'todos' || a.tipo === filtro) && (!q || norm(a.nome).includes(q))
  );

  return (
    <div>
      <input
        className="field"
        placeholder="Buscar aluno…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="filters">
        {filtros.map(([k, lbl]) => {
          const n =
            k === 'todos' ? (alunos ?? []).length : (alunos ?? []).filter((a) => a.tipo === k).length;
          return (
            <button
              key={k}
              className={`f-chip ${filtro === k ? 'active' : ''}`}
              onClick={() => setFiltro(k)}
            >
              {lbl} · {n}
            </button>
          );
        })}
      </div>

      <button className="btn ghost small" style={{ marginBottom: 12 }} onClick={() => setAlvo('novo')}>
        ＋ Novo aluno
      </button>

      {!alunos ? (
        <>
          <div className="skel" style={{ height: 56 }} />
          <div className="skel" style={{ height: 56 }} />
        </>
      ) : lista.length === 0 ? (
        <div className="empty-day">Nenhum aluno encontrado.</div>
      ) : (
        lista.map((a) => (
          <button key={a.id} className="aluno-row" style={{ opacity: a.ativo ? 1 : 0.55 }} onClick={() => setAlvo(a)}>
            <Badge tipo={a.tipo} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">
                {a.nome}
                {!a.ativo && ' · inativo'}
              </div>
              <div className="sub">
                {TIPO_LABEL[a.tipo]}
                {a.telefone ? ` · ${a.telefone}` : ''}
              </div>
            </div>
          </button>
        ))
      )}

      <AlunoSheet alvo={alvo} onFechar={() => setAlvo(null)} />
    </div>
  );
}
