'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/appState';
import { Reserva, TIPO_LABEL } from '@/lib/types';
import { horaFmt, nomeDia } from '@/lib/dates';
import { primeiroNome } from '@/lib/text';
import Badge from './Badge';
import BottomSheet from './BottomSheet';

const STATUS_TXT: Record<Reserva['status'], string> = {
  reservado: 'Reservado',
  checkin: 'Check-in feito ✔',
  falta: 'Faltou ✘',
  cancelado: 'Cancelado',
};

export default function ReservaSheet({
  reserva,
  onFechar,
}: {
  reserva: Reserva | null;
  onFechar: () => void;
}) {
  const { repo, off, toast, bump } = useApp();
  const [ocupado, setOcupado] = useState(false);
  const [confirmaFim, setConfirmaFim] = useState(false);

  useEffect(() => {
    setConfirmaFim(false);
    setOcupado(false);
  }, [reserva?.id]);

  async function roda(fn: () => Promise<void>, msg?: string) {
    if (!reserva || ocupado) return;
    setOcupado(true);
    try {
      await fn();
      bump();
      if (msg) toast(msg);
      onFechar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message);
      setOcupado(false);
    }
  }

  if (!reserva) {
    return <BottomSheet aberto={false} onFechar={onFechar}>{null}</BottomSheet>;
  }

  const r = reserva;
  const ehFixo = r.origem === 'fixo';

  return (
    <BottomSheet aberto={!!reserva} onFechar={onFechar}>
      <div className="sheet-title">
        <Badge tipo={r.tipo_no_dia} /> {r.aluno.nome}
      </div>
      <div className="sheet-sub">
        {TIPO_LABEL[r.tipo_no_dia]} · {ehFixo ? 'horário fixo' : 'avulso'} · {horaFmt(r.hora)}{' '}
        {nomeDia(off)} · <b>{STATUS_TXT[r.status]}</b>
      </div>

      <div className="action-row">
        {r.status === 'reservado' ? (
          <>
            <button
              className="action-btn green"
              disabled={ocupado}
              onClick={() => roda(() => repo.setStatus(r.id, 'checkin'), `Check-in de ${primeiroNome(r.aluno.nome)} ✓`)}
            >
              <span className="ic">✔</span> Check-in — chegou para a aula
            </button>
            <button
              className="action-btn red"
              disabled={ocupado}
              onClick={() => roda(() => repo.setStatus(r.id, 'falta'), `Falta registrada para ${primeiroNome(r.aluno.nome)}.`)}
            >
              <span className="ic">✘</span> Faltou sem avisar
            </button>
            <button
              className="action-btn plain"
              disabled={ocupado}
              onClick={() => roda(() => repo.cancelar(r), `Vaga das ${horaFmt(r.hora)} liberada!`)}
            >
              <span className="ic">💤</span>{' '}
              {ehFixo ? 'Avisou ausência (libera a vaga do dia)' : 'Desmarcar (libera a vaga)'}
            </button>
            {ehFixo && (
              <button
                className={`action-btn ${confirmaFim ? 'red' : 'plain'}`}
                disabled={ocupado}
                onClick={() => {
                  if (!confirmaFim) {
                    setConfirmaFim(true);
                    return;
                  }
                  roda(
                    () => repo.encerrarFixo(r),
                    `Horário fixo de ${primeiroNome(r.aluno.nome)} encerrado.`
                  );
                }}
              >
                <span className="ic">🗓️</span>
                {confirmaFim
                  ? 'Confirmar: encerrar o fixo deste aluno?'
                  : 'Encerrar horário fixo (sai da grade semanal)'}
              </button>
            )}
          </>
        ) : (
          <button
            className="action-btn plain"
            disabled={ocupado}
            onClick={() => roda(() => repo.setStatus(r.id, 'reservado'))}
          >
            <span className="ic">↩</span> Desfazer (volta para “reservado”)
          </button>
        )}
        <button className="action-btn" onClick={onFechar}>
          <span className="ic">✕</span> Fechar
        </button>
      </div>
    </BottomSheet>
  );
}
