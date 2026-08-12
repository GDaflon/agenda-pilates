'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/appState';
import { Aluno, ProximaAula, TIPO_LABEL, TipoAluno } from '@/lib/types';
import { horaFmt } from '@/lib/dates';
import { titleCase } from '@/lib/text';
import BottomSheet from './BottomSheet';

const STATUS_MIN: Record<string, string> = {
  reservado: 'reservado',
  checkin: '✔ presente',
  falta: '✘ falta',
};

export default function AlunoSheet({
  alvo,
  onFechar,
}: {
  alvo: Aluno | 'novo' | null;
  onFechar: () => void;
}) {
  const { repo, toast, bump } = useApp();
  const ehNovo = alvo === 'novo';
  const aluno = alvo && alvo !== 'novo' ? alvo : null;

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipo, setTipo] = useState<TipoAluno>('wellhub');
  const [obs, setObs] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [proximas, setProximas] = useState<ProximaAula[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!alvo) return;
    setSalvando(false);
    if (aluno) {
      setNome(aluno.nome);
      setTelefone(aluno.telefone ?? '');
      setTipo(aluno.tipo);
      setObs(aluno.observacoes ?? '');
      setAtivo(aluno.ativo);
      repo.proximasDoAluno(aluno.id).then(setProximas).catch(() => setProximas([]));
    } else {
      setNome('');
      setTelefone('');
      setTipo('wellhub');
      setObs('');
      setAtivo(true);
      setProximas([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  async function salvar() {
    const nomeLimpo = titleCase(nome);
    if (nomeLimpo.length < 2) {
      toast('Digite o nome do aluno.');
      return;
    }
    setSalvando(true);
    try {
      if (ehNovo) {
        await repo.criarAluno({ nome: nomeLimpo, tipo, telefone: telefone.trim() || undefined });
        toast(`${nomeLimpo} cadastrado ✓`);
      } else if (aluno) {
        await repo.atualizarAluno(aluno.id, {
          nome: nomeLimpo,
          telefone: telefone.trim() || null,
          tipo,
          observacoes: obs.trim() || null,
          ativo,
        });
        toast('Aluno atualizado ✓');
      }
      bump();
      onFechar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
      setSalvando(false);
    }
  }

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
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
      <button className="btn ghost small" onClick={onFechar}>
        Cancelar
      </button>
    </BottomSheet>
  );
}
