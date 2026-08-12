export const DIAS_ABR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DIAS_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

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

export function horaFmt(h: number): string {
  return String(h).padStart(2, '0') + 'h';
}

/** "06:00:00" | "06:00" | 6 → 6 */
export function horaNum(v: string | number): number {
  if (typeof v === 'number') return v;
  return parseInt(v.slice(0, 2), 10);
}

/** 6 → "06:00" (formato time do Postgres) */
export function horaSql(h: number): string {
  return String(h).padStart(2, '0') + ':00';
}

export function agoraHora(): number {
  return new Date().getHours();
}
