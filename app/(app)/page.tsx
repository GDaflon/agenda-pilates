'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/appState';
import { agoraMin, dateFor, DIAS_JANELA, horaFmt, iso } from '@/lib/dates';
import { Reserva, SlotDia } from '@/lib/types';
import Badge from '@/components/Badge';
import MarcarSheet from '@/components/MarcarSheet';
import ReservaSheet from '@/components/ReservaSheet';

export default function AgendaPage() {
  const { repo, unidade, off, setOff, refreshKey, toast } = useApp();
  const [slots, setSlots] = useState<SlotDia[] | null>(null);
  const [marcarHora, setMarcarHora] = useState<number | null>(null);
  const [reservaSel, setReservaSel] = useState<Reserva | null>(null);
  const [encaixe, setEncaixe] = useState(false);

  const dataISO = iso(dateFor(off));
  const agora = agoraMin();
  const toqueRef = useRef<{ x: number; y: number } | null>(null);

  // Swipe lateral na lista troca o dia. Nunca chamamos preventDefault e só
  // reagimos a gestos claramente horizontais, então o scroll vertical fica intacto.
  function aoTocar(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    toqueRef.current = { x: t.clientX, y: t.clientY };
  }
  function aoSoltar(e: React.TouchEvent) {
    const ini = toqueRef.current;
    toqueRef.current = null;
    if (!ini) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ini.x;
    const dy = t.clientY - ini.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return; // gesto vertical
    const novo = off - Math.sign(dx); // arrastar para a esquerda avança o dia
    if (novo >= 0 && novo < DIAS_JANELA) setOff(novo);
  }

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

  // encaixe pode levar a ocupação acima da capacidade — vaga nunca fica negativa
  const vagasDoSlot = (s: SlotDia) => Math.max(0, s.capacidade - s.reservas.length);
  const acimaDaCap = (s: SlotDia) => s.reservas.length > s.capacidade;
  const slotMarcar = slots.find((s) => s.hora === marcarHora);

  return (
    <div onTouchStart={aoTocar} onTouchEnd={aoSoltar}>
      {slots.length > 0 ? (
        <div className="summary">
          <span>
            Ocupação <b>{occ}/{cap}</b>
          </span>
          <span className="dot-sep">•</span>
          <span>
            <b>{Math.max(0, cap - occ)}</b> vagas livres
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
              <span
                className={`slot-occ ${acimaDaCap(s) ? 'over' : vagas === 0 ? 'full' : 'has-vagas'}`}
              >
                {acimaDaCap(s)
                  ? `${s.reservas.length}/${s.capacidade} · encaixe`
                  : vagas === 0
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
                  {r.encaixe && <span className="origin-tag enc">encaixe</span>}
                  {r.origem === 'assistente' && (
                    <span className="origin-tag" title="marcado pelo assistente">✨</span>
                  )}
                  {r.status === 'checkin' && <span className="st-ico ok">✔</span>}
                  {r.status === 'falta' && <span className="st-ico no">✘</span>}
                </button>
              ))}
              {vagas > 0 ? (
                <button
                  className="free-btn"
                  onClick={() => {
                    setEncaixe(false);
                    setMarcarHora(s.hora);
                  }}
                >
                  ＋ Marcar aluno{' '}
                  <span style={{ fontWeight: 600, opacity: 0.75 }}>
                    ({vagas} {vagas === 1 ? 'vaga' : 'vagas'})
                  </span>
                </button>
              ) : (
                <button
                  className="encaixe-btn"
                  onClick={() => {
                    setEncaixe(true);
                    setMarcarHora(s.hora);
                  }}
                >
                  ＋ Encaixe <span className="encaixe-hint">acima da capacidade</span>
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
        capacidade={slotMarcar?.capacidade ?? 0}
        encaixe={encaixe}
        onFechar={() => setMarcarHora(null)}
      />
      <ReservaSheet reserva={reservaSel} onFechar={() => setReservaSel(null)} />
    </div>
  );
}
