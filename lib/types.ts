export type TipoAluno = 'mensalista' | 'wellhub' | 'totalpass';
export type StatusReserva = 'reservado' | 'checkin' | 'falta' | 'cancelado';
export type OrigemReserva = 'fixo' | 'manual' | 'portal' | 'assistente';
export type Papel = 'admin' | 'professora';

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
  hora: number; // 0-23
  aluno: Aluno;
  tipo_no_dia: TipoAluno;
  origem: OrigemReserva;
  status: StatusReserva;
}

export interface SlotDia {
  hora: number;
  capacidade: number;
  reservas: Reserva[]; // apenas ativas (status != cancelado)
  ausencias: string[]; // nomes de fixos que avisaram falta no dia
}

export interface GradeItem {
  dia_semana: number;
  hora: number;
  capacidade: number | null;
  ativo: boolean;
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
}

export const TIPO_LABEL: Record<TipoAluno, string> = {
  mensalista: 'Mensalista',
  wellhub: 'Wellhub',
  totalpass: 'TotalPass',
};

export const TIPO_LETRA: Record<TipoAluno, string> = {
  mensalista: 'M',
  wellhub: 'W',
  totalpass: 'T',
};
