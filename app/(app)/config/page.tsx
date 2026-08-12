'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/appState';
import { DIAS_LONGO, horaFmt } from '@/lib/dates';
import { GradeItem, PAPEL_LABEL } from '@/lib/types';

const HORAS_POSSIVEIS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

export default function ConfigPage() {
  const { repo, demo, sessao, unidades, unidade, setUnidadeId, toast, bump, recarregarUnidades } =
    useApp();
  const router = useRouter();
  const admin = sessao?.papel === 'admin';

  const [nome, setNome] = useState('');
  const [cap, setCap] = useState(5);
  const [novaNome, setNovaNome] = useState('');
  const [novaCap, setNovaCap] = useState(5);
  const [criando, setCriando] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeItem[] | null>(null);
  const [dia, setDia] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 1 : d;
  });
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);

  useEffect(() => {
    if (!unidade) return;
    setNome(unidade.nome);
    setCap(unidade.capacidade_padrao);
    setGrade(null);
    repo
      .grade(unidade.id)
      .then(setGrade)
      .catch((e) => toast('Erro ao carregar grade: ' + (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id]);

  async function salvarUnidade() {
    if (!unidade) return;
    setSalvandoUnidade(true);
    try {
      await repo.salvarUnidade({ ...unidade, nome: nome.trim() || unidade.nome, capacidade_padrao: cap });
      await recarregarUnidades();
      toast('Unidade salva ✓');
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
    }
    setSalvandoUnidade(false);
  }

  async function criarUnidade() {
    const n = novaNome.trim();
    if (!n || criando) return;
    setCriando(true);
    try {
      const u = await repo.criarUnidade({ nome: n, capacidade: novaCap });
      await recarregarUnidades();
      setUnidadeId(u.id);
      setNovaNome('');
      setNovaCap(5);
      toast(`Unidade "${u.nome}" criada ✓ — agora ligue os horários na grade`);
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
    }
    setCriando(false);
  }

  async function excluirUnidade(id: string) {
    try {
      await repo.excluirUnidade(id);
      setConfirmaExcluir(null);
      await recarregarUnidades();
      toast('Unidade excluída ✓');
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
    }
  }

  function ativa(h: number): boolean {
    return !!grade?.find((g) => g.dia_semana === dia && g.hora === h && g.ativo);
  }

  async function toggle(h: number) {
    if (!unidade || !grade) return;
    const nova = !ativa(h);
    // otimista
    setGrade((g) => {
      if (!g) return g;
      const item = g.find((x) => x.dia_semana === dia && x.hora === h);
      if (item) return g.map((x) => (x === item ? { ...x, ativo: nova } : x));
      return [...g, { dia_semana: dia, hora: h, capacidade: null, ativo: nova }];
    });
    try {
      await repo.toggleGrade(unidade.id, dia, h, nova);
      bump();
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
      repo.grade(unidade.id).then(setGrade);
    }
  }

  async function sair() {
    await repo.logout();
    router.replace('/login');
  }

  return (
    <div>
      <div className="card-box">
        <h2>Conta</h2>
        <p className="section-note" style={{ margin: '2px 0 8px' }}>
          {sessao?.nome} · {sessao ? PAPEL_LABEL[sessao.papel] : ''}
          {demo ? ' · modo demonstração (nada é salvo)' : ''}
        </p>
        {!demo && (
          <button className="btn ghost small" onClick={sair}>
            Sair da conta
          </button>
        )}
      </div>

      {admin && (
        <div className="card-box">
          <h2>Unidades</h2>
          <p className="section-note" style={{ margin: '2px 0 8px' }}>
            Excluir tira a unidade das listas — o histórico de aulas fica guardado.
          </p>
          {unidades.map((u) => (
            <div key={u.id} className="unidade-row">
              <span className="nm">{u.nome}</span>
              {confirmaExcluir === u.id ? (
                <span className="unidade-confirm">
                  <button className="mini-danger" onClick={() => excluirUnidade(u.id)}>
                    Confirmar exclusão
                  </button>
                  <button className="mini-plain" onClick={() => setConfirmaExcluir(null)}>
                    cancelar
                  </button>
                </span>
              ) : (
                <button
                  className="mini-plain danger"
                  disabled={unidades.length <= 1}
                  onClick={() => setConfirmaExcluir(u.id)}
                >
                  excluir
                </button>
              )}
            </div>
          ))}
          <span className="field-label">Nova unidade</span>
          <div className="unidade-nova">
            <input
              className="field"
              placeholder="Nome da unidade"
              value={novaNome}
              onChange={(e) => setNovaNome(e.target.value)}
            />
            <input
              className="field cap"
              type="number"
              min={1}
              max={30}
              value={novaCap}
              aria-label="Capacidade padrão"
              onChange={(e) => setNovaCap(Math.max(1, parseInt(e.target.value || '1', 10)))}
            />
          </div>
          <button className="btn small" disabled={!novaNome.trim() || criando} onClick={criarUnidade}>
            {criando ? 'Criando…' : '＋ Criar unidade'}
          </button>
        </div>
      )}

      {admin && unidade && (
        <>
          <div className="card-box">
            <h2>Unidade selecionada</h2>
            <span className="field-label">Nome</span>
            <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} />
            <span className="field-label">Capacidade padrão por turma</span>
            <input
              className="field"
              type="number"
              min={1}
              max={30}
              value={cap}
              onChange={(e) => setCap(Math.max(1, parseInt(e.target.value || '1', 10)))}
            />
            <button className="btn small" disabled={salvandoUnidade} onClick={salvarUnidade}>
              {salvandoUnidade ? 'Salvando…' : 'Salvar unidade'}
            </button>
          </div>

          <div className="card-box">
            <h2>Grade de horários — {unidade.nome}</h2>
            <p className="section-note" style={{ margin: '2px 0 4px' }}>
              Toque para ligar/desligar um horário no dia da semana escolhido.
            </p>
            <div className="filters" style={{ margin: '8px 0 2px' }}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  className={`f-chip ${dia === d ? 'active' : ''}`}
                  onClick={() => setDia(d)}
                >
                  {DIAS_LONGO[d].slice(0, 3)}
                </button>
              ))}
            </div>
            {!grade ? (
              <div className="skel" style={{ height: 120 }} />
            ) : (
              <div className="hour-grid">
                {HORAS_POSSIVEIS.map((h) => (
                  <button
                    key={h}
                    className={`hour-toggle ${ativa(h) ? 'on' : ''}`}
                    onClick={() => toggle(h)}
                  >
                    {horaFmt(h)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!admin && (
        <div className="card-box">
          <h2>Configurações</h2>
          <p className="section-note" style={{ margin: '2px 0 0' }}>
            Edição de unidades e grade é restrita ao dono. Professores podem cadastrar alunos e
            marcar/desmarcar aulas normalmente.
          </p>
        </div>
      )}

      <div className="card-box">
        <h2>Sobre</h2>
        <p className="section-note" style={{ margin: '2px 0 0' }}>
          Agenda Pilates · Fase 1 (MVP interno) · modo {demo ? 'demonstração' : 'produção'}.
          Próximas fases: relatórios (2), autoatendimento Wellhub/TotalPass (3) e assistente IA (4).
        </p>
      </div>
    </div>
  );
}
