import {
  Aluno,
  DiaMes,
  FixoDoAluno,
  GradeItem,
  MembroEquipe,
  Papel,
  ProximaAula,
  Reserva,
  Sessao,
  SlotDia,
  StatusReserva,
  TipoAluno,
  Unidade,
  UsoIaMes,
} from './types';

export type ResultadoMarcacao = { ok: true } | { ok: false; erro: string };

export interface AgendaRepo {
  readonly mode: 'demo' | 'supabase';

  // agenda
  listUnidades(): Promise<Unidade[]>;
  agendaDia(unidadeId: string, dataISO: string): Promise<SlotDia[]>;
  /** Visão do mês: reservas existentes + fixos projetados nos dias ainda não abertos. */
  resumoMes(unidadeId: string, ano: number, mes: number): Promise<DiaMes[]>; // mes 1-12
  marcar(p: {
    unidadeId: string;
    dataISO: string;
    hora: number;
    alunoId: string;
    fixo?: boolean;
    origem?: 'manual' | 'assistente';
    /** true = marca acima da capacidade (encaixe), sem checar vaga */
    encaixe?: boolean;
  }): Promise<ResultadoMarcacao>;
  setStatus(reservaId: string, status: StatusReserva): Promise<void>;
  /** Cancela; se origem = fixo, registra ausência do dia (vaga liberada só na data). */
  cancelar(reserva: Reserva): Promise<void>;
  /** Encerra o vínculo fixo do aluno naquele horário (a partir da data da reserva). */
  encerrarFixo(reserva: Reserva): Promise<void>;

  // alunos
  listAlunos(): Promise<Aluno[]>;
  buscarAlunos(q: string): Promise<Aluno[]>;
  criarAluno(p: { nome: string; tipo: TipoAluno; telefone?: string }): Promise<Aluno>;
  atualizarAluno(
    id: string,
    patch: Partial<Pick<Aluno, 'nome' | 'telefone' | 'tipo' | 'observacoes' | 'ativo'>>
  ): Promise<void>;
  proximasDoAluno(alunoId: string): Promise<ProximaAula[]>;
  /** Horários fixos semanais vigentes do aluno (qualquer convênio). */
  fixosDoAluno(alunoId: string): Promise<FixoDoAluno[]>;

  // configuração (dono)
  grade(unidadeId: string): Promise<GradeItem[]>;
  toggleGrade(unidadeId: string, dia: number, hora: number, ativo: boolean): Promise<void>;
  /** Capacidade específica do horário; null volta a usar o padrão da unidade. */
  setCapacidadeGrade(
    unidadeId: string,
    dia: number,
    hora: number,
    capacidade: number | null
  ): Promise<void>;
  salvarUnidade(u: Unidade): Promise<void>;
  criarUnidade(p: { nome: string; capacidade: number }): Promise<Unidade>;
  /** Desativa a unidade (some das listas; histórico preservado). */
  excluirUnidade(id: string): Promise<void>;

  // equipe (dono) — no Supabase passa pela rota /api/usuarios (service role)
  listEquipe(): Promise<MembroEquipe[]>;
  criarUsuario(p: { nome: string; email: string; senha: string; papel: Papel }): Promise<string | null>; // null = ok
  setPapelUsuario(id: string, papel: Papel): Promise<string | null>;
  setAtivoUsuario(id: string, ativo: boolean): Promise<string | null>;

  // uso da IA (card na Config, dono)
  usoIaMes(): Promise<UsoIaMes>;

  // tempo real
  onReservasChange(cb: () => void): () => void;

  // auth
  login(email: string, senha: string): Promise<string | null>; // null = ok, string = erro
  logout(): Promise<void>;
  sessionInfo(): Promise<Sessao | null>;
  /** Access token do usuário logado (para chamar as rotas /api com RLS). */
  accessToken?(): Promise<string | null>;
  /** Troca a senha do usuário logado e zera precisa_trocar_senha. null = ok. */
  trocarSenha(novaSenha: string): Promise<string | null>;
}

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === '1') return true;
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// getRepo() vive em lib/getRepo.ts (importa as duas implementações).
