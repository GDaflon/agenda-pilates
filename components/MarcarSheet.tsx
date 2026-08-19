'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/appState';
import { Aluno, GradeItem, TIPO_LABEL, TipoAluno } from '@/lib/types';
import { DIAS_ABR, diaSemanaDe, horaFmt, nomeDia, proximaData } from '@/lib/dates';
import { norm, primeiroNome, titleCase } from '@/lib/text';
import Badge from './Badge';
import BottomSheet from './BottomSheet';

export default function MarcarSheet({
  hora,
  dataISO,
  vagasLivres,
  onFechar,
}: {
  hora: number | null;
  dataISO: string;
  vagasLivres: number;
  onFechar: () => void;
}) {
  const { repo, unidade, off, toast, bump } = useApp();
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Aluno[]>([]);
  const [sel, setSel] = useState<Aluno | null>(null);
  const [novo, setNovo] = useState(false);
  const [tipoNovo, setTipoNovo] = useState<TipoAluno>('wellhub');
  const [fixo, setFixo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gradeItens, setGradeItens] = useState<GradeItem[]>([]);
  const [extras, setExtras] = useState<{ dia: number; hora: number }[]>([]);
  const [addDia, setAddDia] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // reset ao abrir
  useEffect(() => {
    if (hora != null) {
      setBusca('');
      setResultados([]);
      setSel(null);
      setNovo(false);
      setTipoNovo('wellhub');
      setFixo(false);
      setSalvando(false);
      setExtras([]);
      setAddDia(null);
      setTimeout(() => inputRef.current?.focus(), 260);
    }
  }, [hora]);

  // grade da unidade (para escolher outros dias do fixo)
  useEffect(() => {
    if (hora == null || !unidade) return;
    repo
      .grade(unidade.id)
      .then((g) => setGradeItens(g.filter((x) => x.ativo)))
      .catch(() => setGradeItens([]));
  }, [hora, unidade, repo]);

  // busca com debounce
  useEffect(() => {
    if (hora == null || sel) return;
    const t = setTimeout(() => {
      repo
        .buscarAlunos(busca)
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 180);
    return () => clearTimeout(t);
  }, [busca, sel, hora, repo]);

  const buscaLimpa = busca.trim();
  const temExato = resultados.some((a) => norm(a.nome) === norm(buscaLimpa));
  const tipoEscolhido: TipoAluno | null = sel ? sel.tipo : novo ? tipoNovo : null;
  // fixo independe do convênio: mensalista, Wellhub e TotalPass podem ter horário fixo
  const mostraFixo = tipoEscolhido != null;
  const podeConfirmar = !!sel || (novo && buscaLimpa.length >= 2);

  const diaBase = diaSemanaDe(dataISO);
  const diasComAula = [...new Set(gradeItens.map((g) => g.dia_semana))].sort();
  const horasDoDia = (dia: number) =>
    gradeItens
      .filter((g) => g.dia_semana === dia)
      .map((g) => g.hora)
      .sort((a, b) => a - b);

  function addExtra(dia: number, h: number) {
    if (dia === diaBase && h === hora) return; // já é o horário base
    if (extras.some((p) => p.dia === dia && p.hora === h)) return;
    setExtras([...extras, { dia, hora: h }]);
    setAddDia(null);
  }

  async function confirmar() {
    if (hora == null || !unidade || !podeConfirmar || salvando) return;
    setSalvando(true);
    try {
      let aluno = sel;
      let cadastrei = false;
      if (!aluno) {
        aluno = await repo.criarAluno({ nome: titleCase(buscaLimpa), tipo: tipoNovo });
        cadastrei = true;
      }
      const ehFixo = mostraFixo && fixo;
      const res = await repo.marcar({
        unidadeId: unidade.id,
        dataISO,
        hora,
        alunoId: aluno.id,
        fixo: ehFixo,
      });
      if (!res.ok) {
        toast(res.erro);
        setSalvando(false);
        return;
      }

      // demais dias do fixo: cada um vira um vínculo a partir da próxima ocorrência
      const falhas: string[] = [];
      let criados = 0;
      if (ehFixo) {
        for (const p of extras) {
          const r2 = await repo.marcar({
            unidadeId: unidade.id,
            dataISO: proximaData(dataISO, p.dia),
            hora: p.hora,
            alunoId: aluno.id,
            fixo: true,
          });
          if (r2.ok) criados++;
          else falhas.push(`${DIAS_ABR[p.dia]} ${horaFmt(p.hora)}: ${r2.erro}`);
        }
      }

      bump();
      if (falhas.length) {
        toast(`${primeiroNome(aluno.nome)} ✓, mas não deu em ${falhas.join(' · ')}`);
      } else {
        toast(
          `${primeiroNome(aluno.nome)} ✓ ${horaFmt(hora)}` +
            (ehFixo ? ` · fixo em ${criados + 1} ${criados ? 'horários' : 'horário'}/semana` : '') +
            (cadastrei ? ' · aluno cadastrado' : '')
        );
      }
      onFechar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <BottomSheet aberto={hora != null} onFechar={onFechar}>
      <div className="sheet-title">Marcar às {hora != null ? horaFmt(hora) : ''}</div>
      <div className="sheet-sub">
        {unidade?.nome} · {nomeDia(off)} · {vagasLivres} vaga(s) livre(s)
      </div>

      <input
        ref={inputRef}
        className="field"
        placeholder="Nome do aluno…"
        value={busca}
        autoComplete="off"
        onChange={(e) => {
          setBusca(e.target.value);
          setSel(null);
          setNovo(false);
          setFixo(false);
          setExtras([]);
          setAddDia(null);
        }}
      />

      <div className="sugg-list">
        {sel ? (
          <div className="sugg-item">
            <Badge tipo={sel.tipo} />
            <span className="nm">{sel.nome}</span>
            <span className="sugg-sub">{TIPO_LABEL[sel.tipo]} ✓</span>
          </div>
        ) : novo ? (
          <div className="sugg-item new">
            <span className="badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              ＋
            </span>
            <span className="nm">Novo: {titleCase(buscaLimpa)}</span>
          </div>
        ) : buscaLimpa.length >= 2 ? (
          <>
            {resultados.map((a) => (
              <button
                key={a.id}
                className="sugg-item"
                onClick={() => {
                  setSel(a);
                  setBusca(a.nome);
                }}
              >
                <Badge tipo={a.tipo} />
                <span className="nm">{a.nome}</span>
                <span className="sugg-sub">{TIPO_LABEL[a.tipo]}</span>
              </button>
            ))}
            {!temExato && (
              <button className="sugg-item new" onClick={() => setNovo(true)}>
                <span
                  className="badge"
                  style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                >
                  ＋
                </span>
                <span className="nm">Cadastrar “{titleCase(buscaLimpa)}” como novo aluno</span>
              </button>
            )}
          </>
        ) : null}
      </div>

      {novo && (
        <>
          <span className="field-label">Aluno novo — qual o tipo?</span>
          <div className="seg">
            {(['mensalista', 'wellhub', 'totalpass'] as TipoAluno[]).map((t) => (
              <button
                key={t}
                className={tipoNovo === t ? 'active' : ''}
                onClick={() => setTipoNovo(t)}
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>
        </>
      )}

      {mostraFixo && (
        <label className="check-row">
          <input type="checkbox" checked={fixo} onChange={(e) => setFixo(e.target.checked)} />
          Tornar horário fixo semanal (toda semana neste horário)
        </label>
      )}

      {mostraFixo && fixo && (
        <div className="fx-extras">
          <span className="field-label">
            Fixo em: {DIAS_ABR[diaBase]} {hora != null ? horaFmt(hora) : ''}
            {extras.map((p) => ` · ${DIAS_ABR[p.dia]} ${horaFmt(p.hora)}`).join('')}
          </span>

          {extras.map((p, i) => (
            <div key={i} className="fx-extra-row">
              <span className="fx-extra-lbl">
                {DIAS_ABR[p.dia]} às {horaFmt(p.hora)}
              </span>
              <button
                className="fx-extra-del"
                onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                aria-label="Remover dia"
              >
                ✕
              </button>
            </div>
          ))}

          {addDia == null ? (
            <div className="fx-day-pick">
              {diasComAula.map((d) => (
                <button key={d} className="f-chip" onClick={() => setAddDia(d)}>
                  ＋ {DIAS_ABR[d]}
                </button>
              ))}
            </div>
          ) : (
            <>
              <span className="field-label">
                Qual horário de {DIAS_ABR[addDia]}?{' '}
                <button className="fx-cancel" onClick={() => setAddDia(null)}>
                  cancelar
                </button>
              </span>
              <div className="fx-day-pick">
                {horasDoDia(addDia).map((h) => (
                  <button
                    key={h}
                    className="f-chip"
                    disabled={
                      (addDia === diaBase && h === hora) ||
                      extras.some((p) => p.dia === addDia && p.hora === h)
                    }
                    onClick={() => addExtra(addDia, h)}
                  >
                    {horaFmt(h)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button className="btn" disabled={!podeConfirmar || salvando} onClick={confirmar}>
        {salvando ? 'Marcando…' : 'Confirmar marcação'}
      </button>
    </BottomSheet>
  );
}
