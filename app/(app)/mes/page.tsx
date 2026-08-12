'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/appState';
import { DIAS_ABR, DIAS_LONGO, MESES_LONGO, ddmm, diaSemanaDe, horaFmt, iso, offDe } from '@/lib/dates';
import { DiaMes, ItemMes } from '@/lib/types';
import { primeiroNome } from '@/lib/text';
import BottomSheet from '@/components/BottomSheet';

export default function MesPage() {
  const { repo, unidade, refreshKey, toast, setOff } = useApp();
  const router = useRouter();
  const hojeISO = iso(new Date());
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth() + 1); // 1-12
  const [dias, setDias] = useState<DiaMes[] | null>(null);
  const [diaSel, setDiaSel] = useState<DiaMes | null>(null);

  useEffect(() => {
    if (!unidade) return;
    let vivo = true;
    repo
      .resumoMes(unidade.id, ano, mes)
      .then((d) => {
        if (vivo) setDias(d);
      })
      .catch((e) => toast('Erro ao carregar: ' + (e as Error).message));
    return () => {
      vivo = false;
    };
  }, [repo, unidade, ano, mes, refreshKey, toast]);

  useEffect(() => {
    setDias(null);
  }, [unidade?.id, ano, mes]);

  function mudaMes(delta: number) {
    let m = mes + delta;
    let a = ano;
    if (m < 1) {
      m = 12;
      a--;
    } else if (m > 12) {
      m = 1;
      a++;
    }
    setMes(m);
    setAno(a);
  }

  function abrirAgenda(data: string) {
    setOff(offDe(data));
    router.push('/');
  }

  const blanks = dias ? diaSemanaDe(dias[0].data) : 0;

  const porHora = (itens: ItemMes[]) => {
    const m = new Map<number, ItemMes[]>();
    for (const it of itens) {
      const lista = m.get(it.hora) ?? [];
      lista.push(it);
      m.set(it.hora, lista);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  };

  return (
    <div>
      <div className="mcal-nav">
        <button className="mcal-arrow" onClick={() => mudaMes(-1)} aria-label="Mês anterior">
          ‹
        </button>
        <span className="mcal-title">
          {MESES_LONGO[mes - 1]} <b>{ano}</b>
        </span>
        <button className="mcal-arrow" onClick={() => mudaMes(1)} aria-label="Próximo mês">
          ›
        </button>
      </div>

      <div className="mcal-week">
        {DIAS_ABR.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {!dias ? (
        <div className="skel" style={{ height: 420 }} />
      ) : (
        <>
          <div className="mcal">
            {Array.from({ length: blanks }, (_, i) => (
              <div key={'v' + i} className="mcal-cell vazio" />
            ))}
            {dias.map((d) => {
              const num = parseInt(d.data.slice(8), 10);
              const semAula = d.capacidade === 0;
              const cheio = d.capacidade > 0 && d.itens.length >= d.capacidade;
              return (
                <button
                  key={d.data}
                  className={`mcal-cell ${d.data === hojeISO ? 'hoje' : ''} ${semAula ? 'sem-aula' : ''}`}
                  onClick={() => setDiaSel(d)}
                >
                  <div className="mcal-top">
                    <span className="mcal-num">{num}</span>
                    {!semAula && (
                      <span className={`mcal-occ ${cheio ? 'full' : ''}`}>
                        {d.itens.length}/{d.capacidade}
                      </span>
                    )}
                  </div>
                  {d.itens.slice(0, 3).map((it, i) => (
                    <span key={i} className={`mcal-item ${it.fixo ? 'fx' : ''}`}>
                      {primeiroNome(it.nome)}
                    </span>
                  ))}
                  {d.itens.length > 3 && <span className="mcal-mais">+{d.itens.length - 3}</span>}
                </button>
              );
            })}
          </div>
          <div className="mcal-legend">
            <span>
              <i className="lg fx" /> fixo semanal
            </span>
            <span>
              <i className="lg" /> avulso
            </span>
          </div>
        </>
      )}

      <BottomSheet aberto={!!diaSel} onFechar={() => setDiaSel(null)}>
        {diaSel && (
          <>
            <div className="sheet-title">
              {DIAS_LONGO[diaSemanaDe(diaSel.data)]},{' '}
              {ddmm(new Date(diaSel.data + 'T12:00:00'))}
            </div>
            <div className="sheet-sub">
              {unidade?.nome} · {diaSel.itens.length}/{diaSel.capacidade} marcados
            </div>

            {diaSel.itens.length === 0 ? (
              <div className="empty-day">Ninguém marcado neste dia ainda.</div>
            ) : (
              porHora(diaSel.itens).map(([hora, itens]) => (
                <div key={hora} className="mes-slot-row">
                  <div className="mes-slot-h">{horaFmt(hora)}</div>
                  <div className="mes-slot-names">
                    {itens.map((it, i) => (
                      <span key={i} className={`mini-chip st-${it.status} ${it.fixo ? 'fx' : ''}`}>
                        {it.nome}
                        {it.fixo && <em className="mini-tag">fixo</em>}
                        {it.status === 'checkin' && ' ✔'}
                        {it.status === 'falta' && ' ✘'}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}

            <button className="btn" onClick={() => abrirAgenda(diaSel.data)}>
              Abrir agenda deste dia
            </button>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
