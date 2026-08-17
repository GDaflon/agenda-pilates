'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/appState';
import { agoraMin, dateFor, horaFmt, iso } from '@/lib/dates';
import { Reserva, SlotDia } from '@/lib/types';
import Badge from '@/components/Badge';
import MarcarSheet from '@/components/MarcarSheet';
import ReservaSheet from '@/components/ReservaSheet';

export default function AgendaPage() {
  const { repo, unidade, off, refreshKey, toast } = useApp();
  const [slots, setSlots] = useState<SlotDia[] | null>(null);
  const [marcarHora, setMarcarHora] = useState<number | null>(null);
  const [reservaSel, setReservaSel] = useState<Reserva | null>(null);

  const dataISO = iso(dateFor(off));
  const agora = agoraMin();

  useEffect(() => {
    if (!unidade) return;
    let vivo = true;
    repo
      .agendaDia(unidade.id, dataISO)
      .then((s) => {
        if (vivo) setSlots(s);
      })
      .catch((e) => toast('Erro ao carregar: ' + (e as Error).message));
    return () => {
      vivo = false;
    };
  }, [repo, unidade, dataISO, refreshKey, toast]);

  // troca de unidade/dia → recomeça do esqueleto
  useEffect(() => {
    setSlots(null);
  }, [unidade?.id, off]);

  if (!slots) {
    return (
      <div>
        <div className="skel" />
        <div className="skel" />
        <div className="skel" />
      </div>
    );
  }

  const cap = slots.reduce((s, x) => s + x.capacidade, 0);
  const occ = slots.reduce((s, x) => s + x.reservas.length, 0);
  const chk = slots.reduce(
    (s, x) => s + x.reservas.filter((r) => r.status === 'checkin').length,
    0
  );

  const vagasDoSlot = (s: SlotDia) => s.capacidade - s.reservas.length;
  const slotMarcar = slots.find((s) => s.hora === marcarHora);

  return (
    <div>
      {slots.length > 0 ? (
        <div className="summary">
          <span>
            Ocupação <b>{occ}/{cap}</b>
          </span>
          <span className="dot-sep">•</span>
          <span>
            <b>{cap - occ}</b> vagas livres
          </span>
          {off === 0 && (
            <>
              <span className="dot-sep">•</span>
              <span>
                <b>{chk}</b> check-ins
              </span>
            </>
          )}
        </div>
      ) : null}

      {slots.length === 0 && (
        <div className="empty-day">🧘‍♀️ Sem turmas neste dia.<br />Escolha outro dia ali em cima.</div>
      )}

      {slots.map((s) => {
        const vagas = vagasDoSlot(s);
        const past = off === 0 && s.hora < agora;
        return (
          <div key={s.hora} className={`slot ${past ? 'past' : ''}`}>
            <div className="slot-head">
              <span className="slot-time">{horaFmt(s.hora)}</span>
              <span className={`slot-occ ${vagas === 0 ? 'full' : 'has-vagas'}`}>
                {vagas === 0
                  ? 'Turma completa'
                  : `${s.reservas.length}/${s.capacidade} · ${vagas} ${vagas === 1 ? 'vaga' : 'vagas'}`}
              </span>
            </div>
            <div className="chips">
              {s.reservas.map((r) => (
                <button key={r.id} className={`chip st-${r.status}`} onClick={() => setReservaSel(r)}>
                  <Badge tipo={r.tipo_no_dia} />
                  <span className="nm">{r.aluno.nome}</span>
                  {r.origem === 'fixo' && <span className="origin-tag">fixo</span>}
                  {r.status === 'checkin' && <span className="st-ico ok">✔</span>}
                  {r.status === 'falta' && <span className="st-ico no">✘</span>}
                </button>
              ))}
              {vagas > 0 && (
                <button className="free-btn" onClick={() => setMarcarHora(s.hora)}>
                  ＋ Marcar aluno{' '}
                  <span style={{ fontWeight: 600, opacity: 0.75 }}>
                    ({vagas} {vagas === 1 ? 'vaga' : 'vagas'})
                  </span>
                </button>
              )}
            </div>
            {s.ausencias.map((nome, i) => (
              <div key={i} className="ausencia-note">
                💤 {nome} avisou falta — vaga liberada
              </div>
            ))}
          </div>
        );
      })}

      <MarcarSheet
        hora={marcarHora}
        dataISO={dataISO}
        vagasLivres={slotMarcar ? vagasDoSlot(slotMarcar) : 0}
        onFechar={() => setMarcarHora(null)}
      />
      <ReservaSheet reserva={reservaSel} onFechar={() => setReservaSel(null)} />
    </div>
  );
}
