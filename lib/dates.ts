export const DIAS_ABR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DIAS_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Janela navegável nas abas Agenda e Vagas: hoje + 7 dias. */
export const DIAS_JANELA = 8;

/** Data local com offset de dias a partir de hoje (meio-dia para evitar bordas de fuso). */
export function dateFor(off: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + off);
  return d;
}

export function iso(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function ddmm(d: Date): string {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

export function labelDia(off: number): string {
  return off === 0 ? 'Hoje' : off === 1 ? 'Amanhã' : DIAS_ABR[dateFor(off).getDay()];
}

/** ex.: "hoje, qua 12/08" | "amanhã, qui 13/08" | "sex 14/08" */
export function nomeDia(off: number): string {
  const d = dateFor(off);
  const prefixo = off === 0 ? 'hoje, ' : off === 1 ? 'amanhã, ' : '';
  return prefixo + DIAS_ABR[d.getDay()] + ' ' + ddmm(d);
}

/* Horário = minutos do dia (330 = 05:30). */

/** 330 → "05h30" */
export function horaFmt(min: number): string {
  return (
    String(Math.floor(min / 60)).padStart(2, '0') + 'h' + String(min % 60).padStart(2, '0')
  );
}

/** "05:30:00" | "05:30" | 330 → 330 (minutos do dia) */
export function horaNum(v: string | number): number {
  if (typeof v === 'number') return v;
  return parseInt(v.slice(0, 2), 10) * 60 + parseInt(v.slice(3, 5) || '0', 10);
}

/** 330 → "05:30" (formato time do Postgres) */
export function horaSql(min: number): string {
  return (
    String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0')
  );
}

/** Minutos do dia neste instante (para "horário já passou hoje"). */
export function agoraMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** mes 1-12 */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** mes 1-12 */
export function dataDoMes(ano: number, mes: number, dia: number): string {
  return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}

export function diaSemanaDe(dataISO: string): number {
  return new Date(dataISO + 'T12:00:00').getDay();
}

/** primeira data >= baseISO que cai no dia-da-semana pedido */
export function proximaData(baseISO: string, diaSemana: number): string {
  const d = new Date(baseISO + 'T12:00:00');
  d.setDate(d.getDate() + ((diaSemana - d.getDay() + 7) % 7));
  return iso(d);
}

/** offset em dias de hoje até dataISO (negativo = passado) */
export function offDe(dataISO: string): number {
  const alvo = new Date(dataISO + 'T12:00:00');
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}
