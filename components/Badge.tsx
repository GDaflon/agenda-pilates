import { TIPO_LETRA, TipoAluno } from '@/lib/types';

export default function Badge({ tipo }: { tipo: TipoAluno }) {
  return <span className={`badge ${tipo}`}>{TIPO_LETRA[tipo]}</span>;
}
