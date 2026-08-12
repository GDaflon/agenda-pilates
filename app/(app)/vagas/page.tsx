'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/appState';
import { dateFor, iso } from '@/lib/dates';
import { buildMensagem } from '@/lib/mensagem';
import { SlotDia } from '@/lib/types';

export default function VagasPage() {
  const { repo, unidade, off, refreshKey, toast } = useApp();
  const [slots, setSlots] = useState<SlotDia[] | null>(null);
  const [horaAtualizacao, setHoraAtualizacao] = useState('');

  const dataISO = iso(dateFor(off));

  useEffect(() => {
    if (!unidade) return;
    let vivo = true;
    repo
      .agendaDia(unidade.id, dataISO)
      .then((s) => {
        if (!vivo) return;
        setSlots(s);
        const d = new Date();
        setHoraAtualizacao(
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        );
      })
      .catch((e) => toast('Erro ao carregar: ' + (e as Error).message));
    return () => {
      vivo = false;
    };
  }, [repo, unidade, dataISO, refreshKey, toast]);

  const msg = slots && unidade ? buildMensagem(unidade.nome, off, slots) : '';

  async function copiar() {
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = msg;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast('Mensagem copiada ✓ É só colar no grupo.');
  }

  return (
    <div>
      <p className="section-note">
        Mensagem pronta para o grupo do WhatsApp da unidade — gerada a partir das vagas reais do
        dia selecionado. Desmarcou alguém? Ela se atualiza sozinha.
      </p>

      {!slots ? (
        <div className="skel" style={{ height: 180 }} />
      ) : (
        <div className="wa-card">
          <div className="wa-bubble">{msg}</div>
          <div className="wa-meta">
            Grupo · Pilates {unidade?.nome} · atualizada às {horaAtualizacao}
          </div>
        </div>
      )}

      <button className="btn" onClick={copiar} disabled={!msg}>
        📋 Copiar mensagem
      </button>
      <p className="section-note" style={{ marginTop: 10 }}>
        Depois é só colar no grupo da unidade no WhatsApp.
      </p>
    </div>
  );
}
