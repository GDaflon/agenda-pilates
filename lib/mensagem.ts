import { SlotDia } from './types';
import { agoraMin, horaFmt, nomeDia } from './dates';

export interface LinhaVaga {
  h: number;
  vagas: number;
}

/** Todos os horários do dia (com e sem vaga); para hoje, só os que ainda não passaram. */
export function linhasVagas(slots: SlotDia[], off: number): LinhaVaga[] {
  const agora = agoraMin();
  return slots
    .filter((s) => off > 0 || s.hora >= agora)
    // encaixe pode passar da capacidade; para o grupo isso é "completo", nunca vaga negativa
    .map((s) => ({ h: s.hora, vagas: Math.max(0, s.capacidade - s.reservas.length) }));
}

export function buildMensagem(unidadeNome: string, off: number, slots: SlotDia[]): string {
  const ls = linhasVagas(slots, off);
  if (!ls.length && off === 0 && slots.length > 0) {
    return `🧘‍♀️ *Natty Pilates ${unidadeNome}*\n\nEncerramos as turmas de hoje! 🙏\nAmanhã cedo mando os horários com vaga.`;
  }
  if (!ls.some((x) => x.vagas > 0)) {
    return `🧘‍♀️ *Natty Pilates ${unidadeNome}*\n\nTurmas de ${nomeDia(off)} completas! 🙌\nAviso aqui assim que abrir vaga.`;
  }
  // horário lotado entra tachado (~texto~ = riscado no WhatsApp) para ninguém pedir de novo
  return (
    `🧘‍♀️ *Natty Pilates ${unidadeNome} — vagas de ${nomeDia(off)}*\n\n` +
    ls
      .map((x) =>
        x.vagas > 0
          ? `• ${horaFmt(x.h)} — ${x.vagas} ${x.vagas === 1 ? 'vaga' : 'vagas'}`
          : `• ~${horaFmt(x.h)}~ ❌ completo`
      )
      .join('\n') +
    `\n\n📲 Responda aqui com o horário para reservar.` +
    `\n✅ Check-in no app (Wellhub/TotalPass) obrigatório na chegada.` +
    `\n⏰ Precisa desmarcar? Avise até 2h antes para liberar a vaga.`
  );
}
