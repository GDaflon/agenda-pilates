import { SlotDia } from './types';
import { agoraMin, horaFmt, nomeDia } from './dates';

export interface LinhaVaga {
  h: number;
  vagas: number;
}

/** Horários com vaga > 0; para hoje, só horários que ainda não passaram. */
export function linhasVagas(slots: SlotDia[], off: number): LinhaVaga[] {
  const agora = agoraMin();
  return slots
    .filter((s) => off > 0 || s.hora >= agora)
    .map((s) => ({ h: s.hora, vagas: s.capacidade - s.reservas.length }))
    .filter((x) => x.vagas > 0);
}

export function buildMensagem(unidadeNome: string, off: number, slots: SlotDia[]): string {
  const ls = linhasVagas(slots, off);
  if (!ls.length) {
    const agora = agoraMin();
    const encerrou = off === 0 && slots.length > 0 && slots.every((s) => s.hora < agora);
    if (encerrou) {
      return `🧘‍♀️ *Natty Pilates ${unidadeNome}*\n\nEncerramos as turmas de hoje! 🙏\nAmanhã cedo mando os horários com vaga.`;
    }
    return `🧘‍♀️ *Natty Pilates ${unidadeNome}*\n\nTurmas de ${nomeDia(off)} completas! 🙌\nAviso aqui assim que abrir vaga.`;
  }
  return (
    `🧘‍♀️ *Natty Pilates ${unidadeNome} — vagas de ${nomeDia(off)}*\n\n` +
    ls.map((x) => `• ${horaFmt(x.h)} — ${x.vagas} ${x.vagas === 1 ? 'vaga' : 'vagas'}`).join('\n') +
    `\n\n📲 Responda aqui com o horário para reservar.` +
    `\n✅ Check-in no app (Wellhub/TotalPass) obrigatório na chegada.` +
    `\n⏰ Precisa desmarcar? Avise até 2h antes para liberar a vaga.`
  );
}
