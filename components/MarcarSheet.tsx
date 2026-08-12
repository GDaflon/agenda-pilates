'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/appState';
import { Aluno, TIPO_LABEL, TipoAluno } from '@/lib/types';
import { horaFmt, nomeDia } from '@/lib/dates';
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
      setTimeout(() => inputRef.current?.focus(), 260);
    }
  }, [hora]);

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
  const mostraFixo = tipoEscolhido === 'mensalista';
  const podeConfirmar = !!sel || (novo && buscaLimpa.length >= 2);

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
      const res = await repo.marcar({
        unidadeId: unidade.id,
        dataISO,
        hora,
        alunoId: aluno.id,
        fixo: mostraFixo && fixo,
      });
      if (!res.ok) {
        toast(res.erro);
        setSalvando(false);
        return;
      }
      bump();
      toast(
        `${primeiroNome(aluno.nome)} ✓ ${horaFmt(hora)}` +
          (mostraFixo && fixo ? ' · fixo semanal' : '') +
          (cadastrei ? ' · aluno cadastrado' : '')
      );
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

      <button className="btn" disabled={!podeConfirmar || salvando} onClick={confirmar}>
        {salvando ? 'Marcando…' : 'Confirmar marcação'}
      </button>
    </BottomSheet>
  );
}
