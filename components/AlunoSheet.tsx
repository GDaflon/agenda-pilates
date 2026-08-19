'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/appState';
import { Aluno, FixoDoAluno, ProximaAula, SlotDia, TIPO_LABEL, TipoAluno } from '@/lib/types';
import { DIAS_LONGO, dateFor, horaFmt, iso, proximaData } from '@/lib/dates';
import { titleCase } from '@/lib/text';
import BottomSheet from './BottomSheet';

const STATUS_MIN: Record<string, string> = {
  reservado: 'reservado',
  checkin: '✔ presente',
  falta: '✘ falta',
};

/** dias com aula no estúdio: segunda a sábado */
const DIAS_UTEIS = [1, 2, 3, 4, 5, 6];

/** horário fixo ainda não gravado, montado no formulário */
interface FixoNovo {
  unidadeId: string;
  unidadeNome: string;
  dia: number;
  hora: number;
}

export default function AlunoSheet({
  alvo,
  onFechar,
}: {
  alvo: Aluno | 'novo' | null;
  onFechar: () => void;
}) {
  const { repo, unidade, unidades, toast, bump } = useApp();
  const ehNovo = alvo === 'novo';
  const aluno = alvo && alvo !== 'novo' ? alvo : null;

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipo, setTipo] = useState<TipoAluno>('wellhub');
  const [obs, setObs] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [proximas, setProximas] = useState<ProximaAula[]>([]);
  const [fixos, setFixos] = useState<FixoDoAluno[]>([]);
  const [salvando, setSalvando] = useState(false);

  // horários fixos a criar + o seletor
  const [novos, setNovos] = useState<FixoNovo[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [addAberto, setAddAberto] = useState(false);
  const [addUnidade, setAddUnidade] = useState('');
  const [addDia, setAddDia] = useState<number | null>(null);
  const [addSlots, setAddSlots] = useState<SlotDia[] | null>(null);
  const [fimConfirma, setFimConfirma] = useState<string | null>(null);
  /** id do aluno recém-criado: evita cadastrar de novo se um fixo falhar */
  const [criadoId, setCriadoId] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) return;
    setSalvando(false);
    setNovos([]);
    setErros([]);
    setAddAberto(false);
    setAddDia(null);
    setAddSlots(null);
    setFimConfirma(null);
    setCriadoId(null);
    setAddUnidade(unidade?.id ?? '');
    if (aluno) {
      setNome(aluno.nome);
      setTelefone(aluno.telefone ?? '');
      setTipo(aluno.tipo);
      setObs(aluno.observacoes ?? '');
      setAtivo(aluno.ativo);
      repo.proximasDoAluno(aluno.id).then(setProximas).catch(() => setProximas([]));
      repo.fixosDoAluno(aluno.id).then(setFixos).catch(() => setFixos([]));
    } else {
      setNome('');
      setTelefone('');
      setTipo('wellhub');
      setObs('');
      setAtivo(true);
      setProximas([]);
      setFixos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  // horários da grade do dia escolhido, com a ocupação da próxima ocorrência
  useEffect(() => {
    if (addDia == null || !addUnidade) return;
    let vivo = true;
    const data = proximaData(iso(dateFor(0)), addDia);
    repo
      .agendaDia(addUnidade, data)
      .then((s) => {
        if (vivo) setAddSlots(s);
      })
      .catch(() => {
        if (vivo) setAddSlots([]);
      });
    return () => {
      vivo = false;
    };
  }, [addDia, addUnidade, repo]);

  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? '';

  function abrirAdd() {
    setAddAberto(true);
    setAddDia(null);
    setAddSlots(null);
    setErros([]);
  }

  function escolherDia(d: number) {
    setAddSlots(null);
    setAddDia(d);
  }

  function escolherUnidade(id: string) {
    setAddSlots(null);
    setAddUnidade(id);
  }

  function addHorario(hora: number) {
    if (addDia == null) return;
    const jaNaLista = novos.some((n) => n.unidadeId === addUnidade && n.dia === addDia && n.hora === hora);
    const jaVinculado = fixos.some(
      (f) => f.unidadeId === addUnidade && f.dia_semana === addDia && f.hora === hora
    );
    if (jaNaLista || jaVinculado) {
      toast('Esse horário já está na lista.');
      return;
    }
    setNovos([
      ...novos,
      { unidadeId: addUnidade, unidadeNome: nomeUnidade(addUnidade), dia: addDia, hora },
    ]);
    setAddAberto(false);
    setAddDia(null);
    setAddSlots(null);
  }

  async function encerrar(f: FixoDoAluno) {
    try {
      await repo.encerrarVinculo(f.id);
      setFixos(fixos.filter((x) => x.id !== f.id));
      setFimConfirma(null);
      bump();
      toast(`Fixo de ${DIAS_LONGO[f.dia_semana].toLowerCase()} às ${horaFmt(f.hora)} encerrado.`);
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
    }
  }

  /** cria os vínculos pendentes; devolve as linhas que falharam */
  async function criarFixos(alunoId: string): Promise<string[]> {
    const falhas: string[] = [];
    const restantes: FixoNovo[] = [];
    const hoje = iso(dateFor(0));
    for (const f of novos) {
      const r = await repo.marcar({
        unidadeId: f.unidadeId,
        dataISO: proximaData(hoje, f.dia),
        hora: f.hora,
        alunoId,
        fixo: true,
      });
      if (r.ok) continue;
      restantes.push(f);
      const diaTxt = DIAS_LONGO[f.dia].toLowerCase();
      falhas.push(
        /completa|sem_vaga|lotad/i.test(r.erro)
          ? `${horaFmt(f.hora)} de ${diaTxt} está completa — escolha outro horário ou use o encaixe pela Agenda.`
          : `${horaFmt(f.hora)} de ${diaTxt}: ${r.erro}`
      );
    }
    setNovos(restantes);
    return falhas;
  }

  async function salvar() {
    const nomeLimpo = titleCase(nome);
    if (nomeLimpo.length < 2) {
      toast('Digite o nome do aluno.');
      return;
    }
    setSalvando(true);
    setErros([]);
    try {
      let alunoId = aluno?.id ?? criadoId;
      if (ehNovo && !alunoId) {
        const a = await repo.criarAluno({
          nome: nomeLimpo,
          tipo,
          telefone: telefone.trim() || undefined,
        });
        alunoId = a.id;
        setCriadoId(a.id);
      } else if (aluno) {
        await repo.atualizarAluno(aluno.id, {
          nome: nomeLimpo,
          telefone: telefone.trim() || null,
          tipo,
          observacoes: obs.trim() || null,
          ativo,
        });
      }

      const falhas = alunoId ? await criarFixos(alunoId) : [];
      bump();

      if (falhas.length) {
        // o aluno já está salvo; só os horários com problema continuam no formulário
        setErros(falhas);
        setSalvando(false);
        return;
      }

      toast(ehNovo ? `${nomeLimpo} cadastrado ✓` : 'Aluno atualizado ✓');
      onFechar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
      setSalvando(false);
    }
  }

  const horariosDoDia = (addSlots ?? []).filter((s) => s.capacidade > 0);

  return (
    <BottomSheet aberto={!!alvo} onFechar={onFechar}>
      <div className="sheet-title">{ehNovo ? 'Novo aluno' : aluno?.nome}</div>
      <div className="sheet-sub">
        {ehNovo ? 'Cadastro rápido — só o nome já basta.' : `${TIPO_LABEL[tipo]}`}
      </div>

      <span className="field-label">Nome</span>
      <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} />

      <span className="field-label">Telefone (opcional)</span>
      <input
        className="field"
        value={telefone}
        inputMode="tel"
        placeholder="(41) 9…"
        onChange={(e) => setTelefone(e.target.value)}
      />

      <span className="field-label">Tipo</span>
      <div className="seg">
        {(['mensalista', 'wellhub', 'totalpass'] as TipoAluno[]).map((t) => (
          <button key={t} className={tipo === t ? 'active' : ''} onClick={() => setTipo(t)}>
            {TIPO_LABEL[t]}
          </button>
        ))}
      </div>

      <span className="field-label">Observações</span>
      <input
        className="field"
        value={obs}
        placeholder="ex.: restrição no ombro direito"
        onChange={(e) => setObs(e.target.value)}
      />

      {!ehNovo && (
        <label className="check-row">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Aluno ativo
        </label>
      )}

      {/* ---------- horários fixos ---------- */}
      <span className="field-label">
        Horários fixos {ehNovo ? '(opcional)' : 'semanais'}
      </span>

      {fixos.length === 0 && novos.length === 0 && !addAberto && (
        <p className="section-note" style={{ margin: '0 0 6px' }}>
          {ehNovo
            ? 'Toda semana no mesmo dia e horário. Dá para adicionar depois.'
            : 'Este aluno ainda não tem horário fixo.'}
        </p>
      )}

      <div className="fx-lista">
        {fixos.map((f) => (
          <div key={f.id} className="fx-item">
            <span className="fx-quando">
              {DIAS_LONGO[f.dia_semana]} · {horaFmt(f.hora)}
              <em>{f.unidadeNome}</em>
            </span>
            {fimConfirma === f.id ? (
              <span className="fx-confirma">
                <button className="mini-danger" onClick={() => encerrar(f)}>
                  Confirmar
                </button>
                <button className="mini-plain" onClick={() => setFimConfirma(null)}>
                  cancelar
                </button>
              </span>
            ) : (
              <button className="mini-plain danger" onClick={() => setFimConfirma(f.id)}>
                encerrar
              </button>
            )}
          </div>
        ))}

        {novos.map((n, i) => (
          <div key={`n${i}`} className="fx-item novo">
            <span className="fx-quando">
              {DIAS_LONGO[n.dia]} · {horaFmt(n.hora)}
              <em>{n.unidadeNome} · ao salvar</em>
            </span>
            <button
              className="mini-plain"
              aria-label="Remover horário"
              onClick={() => setNovos(novos.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {erros.length > 0 && (
        <div className="fx-erros">
          {erros.map((e, i) => (
            <div key={i}>⚠️ {e}</div>
          ))}
        </div>
      )}

      {!addAberto ? (
        <button className="btn ghost small" onClick={abrirAdd}>
          ＋ adicionar horário
        </button>
      ) : (
        <div className="fx-add">
          {unidades.length > 1 && (
            <>
              <span className="field-label">Unidade</span>
              <div className="fx-day-pick">
                {unidades.map((u) => (
                  <button
                    key={u.id}
                    className={`f-chip ${addUnidade === u.id ? 'active' : ''}`}
                    onClick={() => escolherUnidade(u.id)}
                  >
                    {u.nome}
                  </button>
                ))}
              </div>
            </>
          )}

          <span className="field-label">Dia da semana</span>
          <div className="fx-day-pick">
            {DIAS_UTEIS.map((d) => (
              <button
                key={d}
                className={`f-chip ${addDia === d ? 'active' : ''}`}
                onClick={() => escolherDia(d)}
              >
                {DIAS_LONGO[d].slice(0, 3)}
              </button>
            ))}
          </div>

          {addDia != null && (
            <>
              <span className="field-label">
                Horário — ocupação da próxima {DIAS_LONGO[addDia].toLowerCase()}
              </span>
              {addSlots == null ? (
                <div className="skel" style={{ height: 44 }} />
              ) : horariosDoDia.length === 0 ? (
                <p className="section-note" style={{ margin: 0 }}>
                  Sem turmas nesse dia nesta unidade.
                </p>
              ) : (
                <div className="fx-horas">
                  {horariosDoDia.map((s) => {
                    const cheio = s.reservas.length >= s.capacidade;
                    return (
                      <button
                        key={s.hora}
                        className={`fx-hora ${cheio ? 'cheio' : ''}`}
                        onClick={() => addHorario(s.hora)}
                      >
                        <b>{horaFmt(s.hora)}</b>
                        <em>
                          {s.reservas.length}/{s.capacidade}
                          {cheio ? ' · cheia' : ''}
                        </em>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <button className="btn ghost small" onClick={() => setAddAberto(false)}>
            cancelar
          </button>
        </div>
      )}

      {!ehNovo && proximas.length > 0 && (
        <>
          <span className="field-label">Próximas aulas</span>
          <div className="sugg-list">
            {proximas.map((p, i) => (
              <div key={i} className="sugg-item" style={{ cursor: 'default' }}>
                <span className="nm">
                  {p.data.slice(8, 10)}/{p.data.slice(5, 7)} · {horaFmt(p.hora)} · {p.unidadeNome}
                </span>
                <span className="sugg-sub">{STATUS_MIN[p.status] ?? p.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="btn" disabled={salvando} onClick={salvar}>
        {salvando
          ? 'Salvando…'
          : novos.length
            ? `Salvar e criar ${novos.length} ${novos.length === 1 ? 'fixo' : 'fixos'}`
            : 'Salvar'}
      </button>
      <button className="btn ghost small" onClick={onFechar}>
        {criadoId ? 'Fechar' : 'Cancelar'}
      </button>
    </BottomSheet>
  );
}
