import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { AgendaRepo, ResultadoMarcacao } from './repo';
import {
  Aluno,
  DiaMes,
  FixoDoAluno,
  GradeItem,
  ItemMes,
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
import { dataDoMes, dateFor, diaSemanaDe, diasNoMes, horaNum, horaSql, iso } from './dates';
import { inicioDoMesISO } from './precosIa';

/* ============================================================
   Repositório Supabase — produção.
   Requer NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
   Toda a autorização de verdade acontece nas policies (RLS).
   ============================================================ */

let client: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}

/* linhas cruas vindas do banco */
interface AlunoRow {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: TipoAluno;
  observacoes: string | null;
  ativo: boolean;
}

interface ReservaRow {
  id: string;
  unidade_id: string;
  data: string;
  hora: string;
  tipo_no_dia: TipoAluno;
  origem: Reserva['origem'];
  status: StatusReserva;
  encaixe: boolean;
  aluno: AlunoRow | AlunoRow[] | null;
}

function um<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function traduzErro(msg: string): string {
  if (msg.includes('sem_vaga')) return 'Turma completa — a vaga acabou de ser preenchida.';
  if (msg.includes('ja_fixo')) return 'Este aluno já tem horário fixo nessa turma.';
  if (msg.includes('horario_inexistente')) return 'Esse horário não existe na grade da unidade.';
  if (msg.includes('reserva_unica') || msg.includes('duplicate key'))
    return 'Aluno já está nesse horário.';
  return msg;
}

export class SupabaseRepo implements AgendaRepo {
  readonly mode = 'supabase' as const;

  async listUnidades(): Promise<Unidade[]> {
    const { data, error } = await sb()
      .from('unidade')
      .select('id,nome,capacidade_padrao')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    return data ?? [];
  }

  async agendaDia(unidadeId: string, dataISO: string): Promise<SlotDia[]> {
    // 1) materializa os fixos do dia (idempotente)
    await sb().rpc('gerar_dia', { p_unidade: unidadeId, p_data: dataISO });

    // 2) capacidade/estrutura por horário
    const { data: vagas, error: e1 } = await sb().rpc('vagas_do_dia', {
      p_unidade: unidadeId,
      p_data: dataISO,
    });
    if (e1) throw e1;

    // 3) reservas do dia com aluno embutido
    const { data: rs, error: e2 } = await sb()
      .from('reserva')
      .select(
        'id,unidade_id,data,hora,tipo_no_dia,origem,status,encaixe,aluno:aluno_id(id,nome,telefone,tipo,observacoes,ativo)'
      )
      .eq('unidade_id', unidadeId)
      .eq('data', dataISO);
    if (e2) throw e2;

    // 4) ausências avisadas do dia (fixos que liberaram vaga)
    const { data: aus, error: e3 } = await sb()
      .from('ausencia_fixo')
      .select(
        'data, vinculo:vinculo_fixo_id(aluno:aluno_id(nome), grade:grade_horario_id(hora, unidade_id))'
      )
      .eq('data', dataISO);
    if (e3) throw e3;

    const reservas = (rs as unknown as ReservaRow[]) ?? [];
    const porHora = new Map<number, Reserva[]>();
    for (const r of reservas) {
      if (r.status === 'cancelado') continue;
      const aluno = um(r.aluno);
      if (!aluno) continue;
      const h = horaNum(r.hora);
      const lista = porHora.get(h) ?? [];
      lista.push({
        id: r.id,
        unidade_id: r.unidade_id,
        data: r.data,
        hora: h,
        aluno,
        tipo_no_dia: r.tipo_no_dia,
        origem: r.origem,
        status: r.status,
        encaixe: r.encaixe,
      });
      porHora.set(h, lista);
    }

    const ausPorHora = new Map<number, string[]>();
    type AusRow = {
      vinculo: {
        aluno: { nome: string } | { nome: string }[] | null;
        grade: { hora: string; unidade_id: string } | { hora: string; unidade_id: string }[] | null;
      } | null;
    };
    for (const a of ((aus as unknown as AusRow[]) ?? [])) {
      const vinculo = um(a.vinculo);
      const grade = um(vinculo?.grade ?? null);
      const aluno = um(vinculo?.aluno ?? null);
      if (!grade || !aluno) continue;
      if (grade.unidade_id !== unidadeId) continue;
      const h = horaNum(grade.hora);
      const lista = ausPorHora.get(h) ?? [];
      lista.push(aluno.nome);
      ausPorHora.set(h, lista);
    }

    type VagaRow = { hora: string; capacidade: number; ocupadas: number; livres: number };
    return (((vagas as unknown as VagaRow[]) ?? []).map((v) => {
      const h = horaNum(v.hora);
      const lista = (porHora.get(h) ?? []).sort((a, b) =>
        a.origem === b.origem ? a.aluno.nome.localeCompare(b.aluno.nome, 'pt') : a.origem === 'fixo' ? -1 : 1
      );
      return {
        hora: h,
        capacidade: v.capacidade,
        reservas: lista,
        ausencias: ausPorHora.get(h) ?? [],
      };
    }) as SlotDia[]);
  }

  async resumoMes(unidadeId: string, ano: number, mes: number): Promise<DiaMes[]> {
    const nDias = diasNoMes(ano, mes);
    const ini = dataDoMes(ano, mes, 1);
    const fim = dataDoMes(ano, mes, nDias);

    const [uQ, gQ, rQ, vQ, aQ] = await Promise.all([
      sb().from('unidade').select('capacidade_padrao').eq('id', unidadeId).single(),
      sb()
        .from('grade_horario')
        .select('dia_semana,hora,capacidade')
        .eq('unidade_id', unidadeId)
        .eq('ativo', true),
      sb()
        .from('reserva')
        .select('data,hora,status,origem,tipo_no_dia,aluno_id,aluno:aluno_id(nome)')
        .eq('unidade_id', unidadeId)
        .gte('data', ini)
        .lte('data', fim),
      sb()
        .from('vinculo_fixo')
        .select(
          'id,inicio,fim,aluno:aluno_id(id,nome,tipo,ativo),grade:grade_horario_id(dia_semana,hora,unidade_id,ativo)'
        )
        .lte('inicio', fim)
        .or(`fim.is.null,fim.gte.${ini}`),
      sb().from('ausencia_fixo').select('vinculo_fixo_id,data').gte('data', ini).lte('data', fim),
    ]);
    const erro = uQ.error ?? gQ.error ?? rQ.error ?? vQ.error ?? aQ.error;
    if (erro) throw erro;

    const capPadrao = (uQ.data as { capacidade_padrao: number }).capacidade_padrao;

    type GRow = { dia_semana: number; hora: string; capacidade: number | null };
    const capPorDow = new Map<number, number>();
    for (const g of ((gQ.data as unknown as GRow[]) ?? [])) {
      capPorDow.set(g.dia_semana, (capPorDow.get(g.dia_semana) ?? 0) + (g.capacidade ?? capPadrao));
    }

    type RRow = {
      data: string;
      hora: string;
      status: StatusReserva;
      origem: Reserva['origem'];
      tipo_no_dia: TipoAluno;
      aluno_id: string;
      aluno: { nome: string } | { nome: string }[] | null;
    };
    // gerar_dia não recria reserva que já existe (mesmo cancelada) → mesma regra na projeção
    const jaExiste = new Set<string>();
    const porDia = new Map<string, ItemMes[]>();
    for (const r of ((rQ.data as unknown as RRow[]) ?? [])) {
      const h = horaNum(r.hora);
      jaExiste.add(`${r.data}|${h}|${r.aluno_id}`);
      if (r.status === 'cancelado') continue;
      const nome = um(r.aluno)?.nome;
      if (!nome) continue;
      const lista = porDia.get(r.data) ?? [];
      lista.push({
        hora: h,
        nome,
        tipo: r.tipo_no_dia,
        fixo: r.origem === 'fixo',
        previsto: false,
        status: r.status,
      });
      porDia.set(r.data, lista);
    }

    type VRow = {
      id: string;
      inicio: string;
      fim: string | null;
      aluno: { id: string; nome: string; tipo: TipoAluno; ativo: boolean } | { id: string; nome: string; tipo: TipoAluno; ativo: boolean }[] | null;
      grade: { dia_semana: number; hora: string; unidade_id: string; ativo: boolean } | { dia_semana: number; hora: string; unidade_id: string; ativo: boolean }[] | null;
    };
    const vinculos = (((vQ.data as unknown as VRow[]) ?? [])
      .map((v) => ({ id: v.id, inicio: v.inicio, fim: v.fim, aluno: um(v.aluno), grade: um(v.grade) }))
      .filter(
        (v) =>
          v.aluno?.ativo && v.grade?.ativo && v.grade.unidade_id === unidadeId
      ));

    type ARow = { vinculo_fixo_id: string; data: string };
    const ausentes = new Set(
      (((aQ.data as unknown as ARow[]) ?? []).map((a) => `${a.vinculo_fixo_id}|${a.data}`))
    );

    const dias: DiaMes[] = [];
    for (let dia = 1; dia <= nDias; dia++) {
      const data = dataDoMes(ano, mes, dia);
      const dow = diaSemanaDe(data);
      const itens = porDia.get(data) ?? [];
      for (const v of vinculos) {
        if (v.grade!.dia_semana !== dow) continue;
        if (v.inicio > data || (v.fim && v.fim < data)) continue;
        if (ausentes.has(`${v.id}|${data}`)) continue;
        const h = horaNum(v.grade!.hora);
        if (jaExiste.has(`${data}|${h}|${v.aluno!.id}`)) continue;
        itens.push({
          hora: h,
          nome: v.aluno!.nome,
          tipo: v.aluno!.tipo,
          fixo: true,
          previsto: true,
          status: 'reservado',
        });
      }
      itens.sort((a, b) =>
        a.hora !== b.hora
          ? a.hora - b.hora
          : a.fixo !== b.fixo
            ? a.fixo
              ? -1
              : 1
            : a.nome.localeCompare(b.nome, 'pt')
      );
      dias.push({ data, capacidade: capPorDow.get(dow) ?? 0, itens });
    }
    return dias;
  }

  async marcar(p: {
    unidadeId: string;
    dataISO: string;
    hora: number;
    alunoId: string;
    fixo?: boolean;
    origem?: 'manual' | 'assistente';
    encaixe?: boolean;
  }): Promise<ResultadoMarcacao> {
    const params: Record<string, string | boolean> = {
      p_unidade: p.unidadeId,
      p_data: p.dataISO,
      p_hora: horaSql(p.hora),
      p_aluno: p.alunoId,
    };
    if (!p.fixo && p.origem) params.p_origem = p.origem;
    // encaixe é sempre pontual: criar_fixo não abre exceção de capacidade
    if (!p.fixo && p.encaixe) params.p_encaixe = true;
    const { error } = await sb().rpc(p.fixo ? 'criar_fixo' : 'marcar_reserva', params);
    if (error) return { ok: false, erro: traduzErro(error.message) };
    return { ok: true };
  }

  async setStatus(reservaId: string, status: StatusReserva): Promise<void> {
    const { error } = await sb().from('reserva').update({ status }).eq('id', reservaId);
    if (error) throw error;
  }

  async cancelar(reserva: Reserva): Promise<void> {
    const { error } = await sb().rpc('registrar_ausencia', { p_reserva: reserva.id });
    if (error) throw error;
  }

  async encerrarFixo(reserva: Reserva): Promise<void> {
    const { error } = await sb().rpc('encerrar_fixo', { p_reserva: reserva.id });
    if (error) throw error;
  }

  async listAlunos(): Promise<Aluno[]> {
    const { data, error } = await sb()
      .from('aluno')
      .select('id,nome,telefone,tipo,observacoes,ativo')
      .order('nome');
    if (error) throw error;
    return data ?? [];
  }

  async buscarAlunos(q: string): Promise<Aluno[]> {
    let query = sb()
      .from('aluno')
      .select('id,nome,telefone,tipo,observacoes,ativo')
      .eq('ativo', true)
      .order('nome')
      .limit(8);
    if (q.trim()) query = query.ilike('nome', `%${q.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async criarAluno(p: { nome: string; tipo: TipoAluno; telefone?: string }): Promise<Aluno> {
    const { data, error } = await sb()
      .from('aluno')
      .insert({ nome: p.nome, tipo: p.tipo, telefone: p.telefone ?? null })
      .select('id,nome,telefone,tipo,observacoes,ativo')
      .single();
    if (error) throw error;
    return data as Aluno;
  }

  async atualizarAluno(
    id: string,
    patch: Partial<Pick<Aluno, 'nome' | 'telefone' | 'tipo' | 'observacoes' | 'ativo'>>
  ): Promise<void> {
    const { error } = await sb().from('aluno').update(patch).eq('id', id);
    if (error) throw error;
  }

  async proximasDoAluno(alunoId: string): Promise<ProximaAula[]> {
    const hojeISO = iso(dateFor(0));
    const { data, error } = await sb()
      .from('reserva')
      .select('data,hora,status,unidade:unidade_id(nome)')
      .eq('aluno_id', alunoId)
      .neq('status', 'cancelado')
      .gte('data', hojeISO)
      .order('data')
      .order('hora')
      .limit(5);
    if (error) throw error;
    type Row = { data: string; hora: string; status: StatusReserva; unidade: { nome: string } | { nome: string }[] | null };
    return (((data as unknown as Row[]) ?? []).map((r) => ({
      data: r.data,
      hora: horaNum(r.hora),
      unidadeNome: um(r.unidade)?.nome ?? '',
      status: r.status,
    })));
  }

  async fixosDoAluno(alunoId: string): Promise<FixoDoAluno[]> {
    const hojeISO = iso(dateFor(0));
    const { data, error } = await sb()
      .from('vinculo_fixo')
      .select('id,inicio,fim,grade:grade_horario_id(dia_semana,hora,ativo,unidade:unidade_id(id,nome))')
      .eq('aluno_id', alunoId)
      .or(`fim.is.null,fim.gte.${hojeISO}`);
    if (error) throw error;
    type URow = { id: string; nome: string };
    type GRow = {
      dia_semana: number;
      hora: string;
      ativo: boolean;
      unidade: URow | URow[] | null;
    };
    type Row = { id: string; inicio: string; fim: string | null; grade: GRow | GRow[] | null };
    return ((data as unknown as Row[]) ?? [])
      .map((v) => ({ v, g: um(v.grade) }))
      .filter(({ g }) => g != null && g.ativo)
      .map(({ v, g }) => ({
        id: v.id,
        unidadeId: um(g!.unidade)?.id ?? '',
        unidadeNome: um(g!.unidade)?.nome ?? '',
        dia_semana: g!.dia_semana,
        hora: horaNum(g!.hora),
      }))
      .sort((a, b) => (a.dia_semana === b.dia_semana ? a.hora - b.hora : a.dia_semana - b.dia_semana));
  }

  async encerrarVinculo(vinculoId: string): Promise<void> {
    const { error } = await sb().rpc('encerrar_vinculo', { p_vinculo: vinculoId });
    if (error) throw error;
  }

  async grade(unidadeId: string): Promise<GradeItem[]> {
    const { data, error } = await sb()
      .from('grade_horario')
      .select('dia_semana,hora,capacidade,ativo')
      .eq('unidade_id', unidadeId);
    if (error) throw error;
    type Row = { dia_semana: number; hora: string; capacidade: number | null; ativo: boolean };
    return (((data as unknown as Row[]) ?? []).map((g) => ({
      dia_semana: g.dia_semana,
      hora: horaNum(g.hora),
      capacidade: g.capacidade,
      ativo: g.ativo,
    })));
  }

  async toggleGrade(unidadeId: string, dia: number, hora: number, ativo: boolean): Promise<void> {
    const { error } = await sb()
      .from('grade_horario')
      .upsert(
        { unidade_id: unidadeId, dia_semana: dia, hora: horaSql(hora), ativo },
        { onConflict: 'unidade_id,dia_semana,hora' }
      );
    if (error) throw error;
  }

  async setCapacidadeGrade(
    unidadeId: string,
    dia: number,
    hora: number,
    capacidade: number | null
  ): Promise<void> {
    const { error } = await sb()
      .from('grade_horario')
      .upsert(
        { unidade_id: unidadeId, dia_semana: dia, hora: horaSql(hora), capacidade },
        { onConflict: 'unidade_id,dia_semana,hora' }
      );
    if (error) throw error;
  }

  async salvarUnidade(u: Unidade): Promise<void> {
    const { error } = await sb()
      .from('unidade')
      .update({ nome: u.nome, capacidade_padrao: u.capacidade_padrao })
      .eq('id', u.id);
    if (error) throw error;
  }

  async criarUnidade(p: { nome: string; capacidade: number }): Promise<Unidade> {
    const { data, error } = await sb()
      .from('unidade')
      .insert({ nome: p.nome, capacidade_padrao: p.capacidade })
      .select('id,nome,capacidade_padrao')
      .single();
    if (error) throw error;
    return data as Unidade;
  }

  async excluirUnidade(id: string): Promise<void> {
    const { error } = await sb().from('unidade').update({ ativo: false }).eq('id', id);
    if (error) throw error;
  }

  async listEquipe(): Promise<MembroEquipe[]> {
    const { data, error } = await sb()
      .from('perfil')
      .select('id,nome,papel,ativo')
      .order('nome');
    if (error) throw error;
    return (data ?? []) as MembroEquipe[];
  }

  /** POST /api/usuarios com o token do usuário; o servidor valida o papel dono de novo */
  private async apiUsuarios(corpo: Record<string, unknown>): Promise<string | null> {
    const token = await this.accessToken();
    if (!token) return 'Sessão expirada — faça login de novo.';
    try {
      const r = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!r.ok) return (j.erro as string) ?? `Erro ${r.status}`;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  async criarUsuario(p: {
    nome: string;
    email: string;
    senha: string;
    papel: Papel;
  }): Promise<string | null> {
    return this.apiUsuarios({ acao: 'criar', ...p });
  }

  async setPapelUsuario(id: string, papel: Papel): Promise<string | null> {
    return this.apiUsuarios({ acao: 'papel', id, papel });
  }

  async setAtivoUsuario(id: string, ativo: boolean): Promise<string | null> {
    return this.apiUsuarios({ acao: 'ativo', id, ativo });
  }

  async usoIaMes(): Promise<UsoIaMes> {
    const { data, error } = await sb()
      .from('uso_ia')
      .select('tokens_entrada,tokens_saida,custo_usd')
      .gte('criado_em', inicioDoMesISO());
    if (error) throw error;
    type Row = { tokens_entrada: number; tokens_saida: number; custo_usd: number };
    const linhas = (data ?? []) as Row[];
    return {
      comandos: linhas.length,
      tokensEntrada: linhas.reduce((s, r) => s + r.tokens_entrada, 0),
      tokensSaida: linhas.reduce((s, r) => s + r.tokens_saida, 0),
      custoUsd: linhas.reduce((s, r) => s + Number(r.custo_usd), 0),
    };
  }

  onReservasChange(cb: () => void): () => void {
    const channel = sb()
      .channel('reservas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, () => cb())
      .subscribe();
    return () => {
      sb().removeChannel(channel);
    };
  }

  async login(email: string, senha: string): Promise<string | null> {
    const { error } = await sb().auth.signInWithPassword({ email, password: senha });
    if (!error) return null;
    if (error.message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (error.message.toLowerCase().includes('banned')) return 'Conta desativada — fale com a administração.';
    return error.message;
  }

  async logout(): Promise<void> {
    await sb().auth.signOut();
  }

  async accessToken(): Promise<string | null> {
    const { data } = await sb().auth.getSession();
    return data.session?.access_token ?? null;
  }

  async sessionInfo(): Promise<Sessao | null> {
    const { data } = await sb().auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const { data: perfil } = await sb()
      .from('perfil')
      .select('nome,papel,precisa_trocar_senha')
      .eq('id', user.id)
      .single();
    return {
      nome: perfil?.nome ?? user.email ?? 'Equipe',
      papel: (perfil?.papel as Sessao['papel']) ?? 'professora',
      email: user.email ?? undefined,
      precisaTrocarSenha: perfil?.precisa_trocar_senha ?? false,
    };
  }

  async trocarSenha(novaSenha: string): Promise<string | null> {
    const { data, error } = await sb().auth.updateUser({ password: novaSenha });
    if (error) {
      if (error.message.includes('different from the old'))
        return 'A nova senha precisa ser diferente da senha temporária.';
      if (error.message.toLowerCase().includes('at least'))
        return 'A senha precisa ter pelo menos 8 caracteres.';
      return error.message;
    }
    const { error: e2 } = await sb()
      .from('perfil')
      .update({ precisa_trocar_senha: false })
      .eq('id', data.user.id);
    if (e2) return 'Senha trocada, mas falhou ao atualizar o perfil: ' + e2.message;
    return null;
  }
}
