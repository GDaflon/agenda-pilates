'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/appState';
import { DIAS_LONGO, horaFmt } from '@/lib/dates';
import { GradeItem, MembroEquipe, PAPEL_LABEL, Papel, UsoIaMes } from '@/lib/types';

// passos de 30min, de 05:00 a 21:30 (minutos do dia)
const HORAS_POSSIVEIS = Array.from({ length: (21 * 60 + 30 - 5 * 60) / 30 + 1 }, (_, i) => 5 * 60 + i * 30);

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

  // equipe (admin)
  const [equipe, setEquipe] = useState<MembroEquipe[] | null>(null);
  const [eqNome, setEqNome] = useState('');
  const [eqEmail, setEqEmail] = useState('');
  const [eqSenha, setEqSenha] = useState('');
  const [eqPapel, setEqPapel] = useState<Papel>('professora');
  const [eqCriando, setEqCriando] = useState(false);
  const [eqOcupado, setEqOcupado] = useState<string | null>(null); // id em operação

  useEffect(() => {
    if (!admin) return;
    repo
      .listEquipe()
      .then(setEquipe)
      .catch((e) => toast('Erro ao carregar equipe: ' + (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  // uso da IA no mês (admin)
  const [usoIa, setUsoIa] = useState<UsoIaMes | null>(null);
  const [limiteIa, setLimiteIa] = useState(5);
  useEffect(() => {
    if (!admin) return;
    repo.usoIaMes().then(setUsoIa).catch(() => setUsoIa(null));
    if (!demo) {
      fetch('/api/assistente')
        .then((r) => r.json())
        .then((j) => {
          if (typeof j.limiteUsd === 'number') setLimiteIa(j.limiteUsd);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  async function recarregarEquipe() {
    setEquipe(await repo.listEquipe());
  }

  async function criarMembro() {
    if (eqCriando) return;
    setEqCriando(true);
    const erro = await repo.criarUsuario({
      nome: eqNome.trim(),
      email: eqEmail.trim(),
      senha: eqSenha,
      papel: eqPapel,
    });
    if (erro) {
      toast(erro);
    } else {
      toast(`${eqNome.trim()} pode entrar com ${eqEmail.trim()} e a senha temporária ✓`);
      setEqNome('');
      setEqEmail('');
      setEqSenha('');
      setEqPapel('professora');
      await recarregarEquipe();
    }
    setEqCriando(false);
  }

  async function trocarPapel(m: MembroEquipe) {
    setEqOcupado(m.id);
    const erro = await repo.setPapelUsuario(m.id, m.papel === 'admin' ? 'professora' : 'admin');
    if (erro) toast(erro);
    else await recarregarEquipe();
    setEqOcupado(null);
  }

  async function trocarAtivo(m: MembroEquipe) {
    setEqOcupado(m.id);
    const erro = await repo.setAtivoUsuario(m.id, !m.ativo);
    if (erro) toast(erro);
    else {
      toast(m.ativo ? `${m.nome} desativado(a) — não consegue mais entrar.` : `${m.nome} reativado(a) ✓`);
      await recarregarEquipe();
    }
    setEqOcupado(null);
  }

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

      {admin && (
        <div className="card-box">
          <h2>Equipe</h2>
          <p className="section-note" style={{ margin: '2px 0 8px' }}>
            Professoras entram com e-mail e senha. Desativar bloqueia o login na hora.
            {demo ? ' (demo: simulado em memória)' : ''}
          </p>
          {!equipe ? (
            <div className="skel" style={{ height: 80 }} />
          ) : (
            equipe.map((m) => (
              <div key={m.id} className={`equipe-row ${m.ativo ? '' : 'inativo'}`}>
                <span className="nm">
                  {m.nome}
                  <em className="equipe-papel">{PAPEL_LABEL[m.papel]}</em>
                  {!m.ativo && <em className="equipe-off">desativado</em>}
                </span>
                <span className="equipe-acoes">
                  <button
                    className="mini-plain"
                    disabled={eqOcupado === m.id}
                    onClick={() => trocarPapel(m)}
                  >
                    {m.papel === 'admin' ? 'virar professora' : 'virar admin'}
                  </button>
                  <button
                    className={`mini-plain ${m.ativo ? 'danger' : ''}`}
                    disabled={eqOcupado === m.id}
                    onClick={() => trocarAtivo(m)}
                  >
                    {m.ativo ? 'desativar' : 'reativar'}
                  </button>
                </span>
              </div>
            ))
          )}
          <span className="field-label">Nova professora</span>
          <input
            className="field"
            placeholder="Nome"
            value={eqNome}
            onChange={(e) => setEqNome(e.target.value)}
          />
          <input
            className="field"
            type="email"
            placeholder="E-mail"
            autoComplete="off"
            value={eqEmail}
            onChange={(e) => setEqEmail(e.target.value)}
          />
          <input
            className="field"
            type="text"
            placeholder="Senha temporária (6+ caracteres)"
            autoComplete="off"
            value={eqSenha}
            onChange={(e) => setEqSenha(e.target.value)}
          />
          <div className="seg" style={{ marginTop: 6 }}>
            {(['professora', 'admin'] as Papel[]).map((p) => (
              <button key={p} className={eqPapel === p ? 'active' : ''} onClick={() => setEqPapel(p)}>
                {PAPEL_LABEL[p]}
              </button>
            ))}
          </div>
          <button
            className="btn small"
            disabled={!eqNome.trim() || !eqEmail.trim() || eqSenha.length < 6 || eqCriando}
            onClick={criarMembro}
          >
            {eqCriando ? 'Criando…' : '＋ Criar usuário'}
          </button>
        </div>
      )}

      {admin && (
        <div className="card-box">
          <h2>Uso da IA (mês)</h2>
          <p className="section-note" style={{ margin: '2px 0 10px' }}>
            Consumo do ✨ Assistente no mês corrente. Limite: US$ {limiteIa.toFixed(2)}
            {demo ? ' · demo: dados fictícios' : ' (env IA_LIMITE_MENSAL_USD)'}.
          </p>
          {!usoIa ? (
            <div className="skel" style={{ height: 60 }} />
          ) : (
            <>
              <div className="uso-grid">
                <div className="uso-stat">
                  <b>{usoIa.comandos}</b>
                  <span>comandos</span>
                </div>
                <div className="uso-stat">
                  <b>{(usoIa.tokensEntrada + usoIa.tokensSaida).toLocaleString('pt-BR')}</b>
                  <span>tokens</span>
                </div>
                <div className="uso-stat">
                  <b>US$ {usoIa.custoUsd.toFixed(2)}</b>
                  <span>gasto</span>
                </div>
              </div>
              <div
                className="uso-bar"
                role="progressbar"
                aria-valuenow={Math.round((usoIa.custoUsd / Math.max(limiteIa, 0.01)) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i
                  style={{
                    width: `${Math.min(100, (usoIa.custoUsd / Math.max(limiteIa, 0.01)) * 100)}%`,
                  }}
                />
              </div>
              <p className="section-note" style={{ margin: '6px 0 0' }}>
                US$ {usoIa.custoUsd.toFixed(2)} de US$ {limiteIa.toFixed(2)} — ao atingir o limite,
                o assistente pausa até o mês virar (ou o limite subir).
              </p>
            </>
          )}
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
          Natty Estúdio Pilates · agenda interna com assistente IA · modo{' '}
          {demo ? 'demonstração' : 'produção'}. Próximas fases: relatórios (2) e autoatendimento
          Wellhub/TotalPass (3).
        </p>
      </div>
    </div>
  );
}
