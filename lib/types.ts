export type TipoAluno = 'mensalista' | 'wellhub' | 'totalpass';
export type StatusReserva = 'reservado' | 'checkin' | 'falta' | 'cancelado';
export type OrigemReserva = 'fixo' | 'manual' | 'portal' | 'assistente';
export type Papel = 'dono' | 'professora';

/** Capacidade padrão de uma turma quando o horário não define a sua. */
export const CAPACIDADE_PADRAO = 6;

export interface Unidade {
  id: string;
  nome: string;
  capacidade_padrao: number;
}

export interface Aluno {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: TipoAluno;
  observacoes: string | null;
  ativo: boolean;
}

export interface Reserva {
  id: string;
  unidade_id: string;
  data: string; // YYYY-MM-DD
  hora: number; // minutos do dia (330 = 05:30)
  aluno: Aluno;
  tipo_no_dia: TipoAluno;
  origem: OrigemReserva;
  status: StatusReserva;
  /** true = marcado acima da capacidade, por decisão explícita da equipe */
  encaixe: boolean;
}

export interface SlotDia {
  hora: number; // minutos do dia
  capacidade: number;
  reservas: Reserva[]; // apenas ativas (status != cancelado)
  ausencias: string[]; // nomes de fixos que avisaram falta no dia
}

export interface GradeItem {
  dia_semana: number;
  hora: number; // minutos do dia
  capacidade: number | null;
  ativo: boolean;
}

/** uma pessoa agendada em um dia do mês (real ou fixo previsto) */
export interface ItemMes {
  hora: number;
  nome: string;
  tipo: TipoAluno;
  fixo: boolean;
  /** true = vem do vínculo fixo, dia ainda não aberto na agenda */
  previsto: boolean;
  status: StatusReserva;
}

export interface DiaMes {
  data: string; // YYYY-MM-DD
  capacidade: number; // soma das turmas do dia
  itens: ItemMes[];
}

/** horário fixo semanal de um aluno (ficha do aluno) */
export interface FixoDoAluno {
  /** id do vinculo_fixo — usado para encerrar */
  id: string;
  unidadeId: string;
  unidadeNome: string;
  dia_semana: number; // 0 = domingo
  hora: number; // minutos do dia
}

export interface ProximaAula {
  data: string;
  hora: number;
  unidadeNome: string;
  status: StatusReserva;
}

export interface Sessao {
  nome: string;
  papel: Papel;
  email?: string;
  /** true = senha temporária: forçar /trocar-senha antes de liberar o app */
  precisaTrocarSenha?: boolean;
}

/** resumo do mês corrente do uso da IA (card na Config, admin) */
export interface UsoIaMes {
  comandos: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
}

/** membro da equipe listado no card Equipe (Config, admin) */
export interface MembroEquipe {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  email?: string;
}

export const TIPO_LABEL: Record<TipoAluno, string> = {
  mensalista: 'Mensalista',
  wellhub: 'Wellhub',
  totalpass: 'TotalPass',
};

export const PAPEL_LABEL: Record<Papel, string> = {
  dono: 'Dono(a) do estúdio',
  professora: 'Professor(a)',
};

export const TIPO_LETRA: Record<TipoAluno, string> = {
  mensalista: 'M',
  wellhub: 'W',
  totalpass: 'T',
};
