import type { AgendaRepo, ResultadoMarcacao } from './repo';
import {
  Aluno,
  DiaMes,
  GradeItem,
  ItemMes,
  ProximaAula,
  Reserva,
  Sessao,
  SlotDia,
  StatusReserva,
  TipoAluno,
  Unidade,
} from './types';
import { agoraHora, dataDoMes, dateFor, diaSemanaDe, diasNoMes, iso } from './dates';
import { norm } from './text';

/* ============================================================
   Repositório DEMO — dados fictícios em memória.
   Permite rodar o app sem configurar nada (NEXT_PUBLIC_DEMO=1
   ou sem variáveis do Supabase). Nada é persistido.
   ============================================================ */

interface ReservaRow {
  id: string;
  unidade_id: string;
  data: string;
  hora: number;
  alunoId: string;
  tipo_no_dia: TipoAluno;
  origem: Reserva['origem'];
  status: StatusReserva;
  ausencia?: boolean;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMES = ['Ana','Beatriz','Bruna','Camila','Carla','Cecília','Cláudia','Daniela','Débora','Elaine','Fernanda','Flávia','Gabriela','Helena','Isabela','Juliana','Larissa','Lúcia','Marcela','Mariana','Marta','Natália','Patrícia','Paula','Renata','Roberta','Sandra','Simone','Sônia','Tatiane','Vanessa','Vera','Vitória','Bruno','Carlos','Diego','Eduardo','Gustavo','Leonardo','Márcio','Otávio','Rafael','Ricardo','Rodrigo','Thiago'];
const SOBRENOMES = ['Silva','Souza','Oliveira','Santos','Costa','Pereira','Almeida','Nunes','Lima','Ferreira','Ramos','Rocha','Dias','Moreira','Barbosa','Teixeira','Cardoso','Martins','Freitas','Campos'];
const POPULARES = [6, 7, 8, 18, 19];

function gradeHoras(wd: number): number[] {
  if (wd >= 1 && wd <= 5) return [6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19];
  if (wd === 6) return [8, 9, 10, 11];
  return [];
}

class DemoState {
  unidades: Unidade[] = [
    { id: 'u-centro', nome: 'Centro', capacidade_padrao: 5 },
    { id: 'u-jardim', nome: 'Jardim', capacidade_padrao: 5 },
  ];
  alunos: Aluno[] = [];
  grade = new Map<string, GradeItem[]>(); // unidadeId -> itens
  fixos = new Map<string, string[]>(); // `${uid}|${wd}|${h}` -> alunoIds
  reservas: ReservaRow[] = [];
  seq = 1;

  private rng = mulberry32(42);
  private usados = new Set<string>();

  constructor() {
    this.seed();
  }

  novoId(prefix: string) {
    return `${prefix}-${this.seq++}`;
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  private novoNome(): string {
    for (let i = 0; i < 300; i++) {
      const n = this.pick(NOMES) + ' ' + this.pick(SOBRENOMES);
      if (!this.usados.has(n)) {
        this.usados.add(n);
        return n;
      }
    }
    return this.pick(NOMES) + ' ' + this.pick(SOBRENOMES) + ' Jr.';
  }

  criarAlunoInterno(nome: string, tipo: TipoAluno, telefone?: string): Aluno {
    const a: Aluno = {
      id: this.novoId('a'),
      nome,
      tipo,
      telefone:
        telefone ??
        `(41) 9${8000 + Math.floor(this.rng() * 1999)}-${1000 + Math.floor(this.rng() * 8999)}`,
      observacoes: null,
      ativo: true,
    };
    this.alunos.push(a);
    return a;
  }

  private seed() {
    // grade padrão por unidade
    for (const u of this.unidades) {
      const itens: GradeItem[] = [];
      for (let wd = 0; wd < 7; wd++) {
        for (const h of gradeHoras(wd)) {
          itens.push({ dia_semana: wd, hora: h, capacidade: null, ativo: true });
        }
      }
      this.grade.set(u.id, itens);
    }

    // mensalistas por unidade + avulsos compartilhados
    const mensalistas = new Map<string, Aluno[]>();
    for (const u of this.unidades) {
      mensalistas.set(
        u.id,
        Array.from({ length: 18 }, () => this.criarAlunoInterno(this.novoNome(), 'mensalista'))
      );
    }
    const avulsos = [
      ...Array.from({ length: 12 }, () => this.criarAlunoInterno(this.novoNome(), 'wellhub')),
      ...Array.from({ length: 9 }, () => this.criarAlunoInterno(this.novoNome(), 'totalpass')),
    ];

    // fixos: densidade realista (manhã/fim de tarde cheios)
    for (const u of this.unidades) {
      for (let wd = 0; wd < 7; wd++) {
        const ocupadosDoDia = new Set<string>();
        for (const h of gradeHoras(wd)) {
          const alvo = POPULARES.includes(h)
            ? 3 + Math.floor(this.rng() * 3)
            : Math.floor(this.rng() * 3);
          const lista: string[] = [];
          let tent = 0;
          const pool = mensalistas.get(u.id)!;
          while (lista.length < Math.min(alvo, 5) && tent++ < 40) {
            const a = this.pick(pool);
            const k = a.id + '|' + wd;
            if (!ocupadosDoDia.has(k) && !lista.includes(a.id)) {
              lista.push(a.id);
              ocupadosDoDia.add(k);
            }
          }
          this.fixos.set(`${u.id}|${wd}|${h}`, lista);
        }
      }
    }

    // materializa hoje..+13 (duas semanas de demo)
    for (let off = 0; off <= 13; off++) this.materializarDia(off);

    // avulsos de exemplo nos 3 primeiros dias
    const agora = agoraHora();
    for (let off = 0; off <= 2; off++) {
      const data = iso(dateFor(off));
      const wd = dateFor(off).getDay();
      for (const u of this.unidades) {
        let colocados = 0;
        for (const h of gradeHoras(wd)) {
          if (colocados >= 4) break;
          if (this.vagas(u.id, data, h) > 0 && this.rng() < 0.5) {
            const a = this.pick(avulsos);
            if (this.slotReservas(u.id, data, h).some((r) => r.alunoId === a.id)) continue;
            let status: StatusReserva = 'reservado';
            if (off === 0 && h < agora) status = this.rng() < 0.75 ? 'checkin' : 'falta';
            this.reservas.push({
              id: this.novoId('r'),
              unidade_id: u.id,
              data,
              hora: h,
              alunoId: a.id,
              tipo_no_dia: a.tipo,
              origem: 'manual',
              status,
            });
            colocados++;
          }
        }
      }
    }

    // check-ins nos fixos que já passaram hoje + algumas ausências avisadas
    const hoje = iso(dateFor(0));
    for (const r of this.reservas) {
      if (r.data === hoje && r.origem === 'fixo' && r.hora < agora && r.status === 'reservado') {
        r.status = this.rng() < 0.85 ? 'checkin' : 'falta';
      }
    }
    for (const off of [0, 1]) {
      const data = iso(dateFor(off));
      for (const u of this.unidades) {
        const candidatos = this.reservas.filter(
          (r) =>
            r.unidade_id === u.id &&
            r.data === data &&
            r.origem === 'fixo' &&
            r.status === 'reservado' &&
            (off > 0 || r.hora > agora)
        );
        if (candidatos.length) {
          const r = candidatos[Math.floor(this.rng() * candidatos.length)];
          r.status = 'cancelado';
          r.ausencia = true;
        }
      }
    }
  }

  materializarDia(off: number) {
    const d = dateFor(off);
    const data = iso(d);
    const wd = d.getDay();
    for (const u of this.unidades) {
      for (const h of gradeHoras(wd)) {
        for (const alunoId of this.fixos.get(`${u.id}|${wd}|${h}`) ?? []) {
          const jaExiste = this.reservas.some(
            (r) => r.unidade_id === u.id && r.data === data && r.hora === h && r.alunoId === alunoId
          );
          if (!jaExiste) {
            const aluno = this.alunos.find((a) => a.id === alunoId)!;
            this.reservas.push({
              id: this.novoId('r'),
              unidade_id: u.id,
              data,
              hora: h,
              alunoId,
              tipo_no_dia: aluno.tipo,
              origem: 'fixo',
              status: 'reservado',
            });
          }
        }
      }
    }
  }

  slotReservas(uid: string, data: string, h: number): ReservaRow[] {
    return this.reservas.filter(
      (r) => r.unidade_id === uid && r.data === data && r.hora === h && r.status !== 'cancelado'
    );
  }

  vagas(uid: string, data: string, h: number): number {
    const u = this.unidades.find((x) => x.id === uid)!;
    return u.capacidade_padrao - this.slotReservas(uid, data, h).length;
  }

  aluno(id: string): Aluno {
    return this.alunos.find((a) => a.id === id)!;
  }
}

let state: DemoState | null = null;
function st(): DemoState {
  if (!state) state = new DemoState();
  return state;
}

const espera = (ms = 120) => new Promise((res) => setTimeout(res, ms));

export class DemoRepo implements AgendaRepo {
  readonly mode = 'demo' as const;
  private listeners = new Set<() => void>();

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  private toReserva(r: ReservaRow): Reserva {
    return {
      id: r.id,
      unidade_id: r.unidade_id,
      data: r.data,
      hora: r.hora,
      aluno: st().aluno(r.alunoId),
      tipo_no_dia: r.tipo_no_dia,
      origem: r.origem,
      status: r.status,
    };
  }

  async listUnidades(): Promise<Unidade[]> {
    await espera(40);
    return [...st().unidades];
  }

  async agendaDia(unidadeId: string, dataISO: string): Promise<SlotDia[]> {
    await espera();
    const s = st();
    const wd = new Date(dataISO + 'T12:00:00').getDay();
    const itens = (s.grade.get(unidadeId) ?? []).filter((g) => g.dia_semana === wd && g.ativo);
    const cap = s.unidades.find((u) => u.id === unidadeId)?.capacidade_padrao ?? 5;
    return itens
      .sort((a, b) => a.hora - b.hora)
      .map((g) => {
        const ativas = s.slotReservas(unidadeId, dataISO, g.hora).map((r) => this.toReserva(r));
        const ausencias = s.reservas
          .filter(
            (r) =>
              r.unidade_id === unidadeId &&
              r.data === dataISO &&
              r.hora === g.hora &&
              r.status === 'cancelado' &&
              r.ausencia
          )
          .map((r) => s.aluno(r.alunoId).nome);
        return { hora: g.hora, capacidade: g.capacidade ?? cap, reservas: ativas, ausencias };
      });
  }

  async resumoMes(unidadeId: string, ano: number, mes: number): Promise<DiaMes[]> {
    await espera();
    const s = st();
    const capPadrao = s.unidades.find((u) => u.id === unidadeId)?.capacidade_padrao ?? 5;
    const gradeAtiva = (s.grade.get(unidadeId) ?? []).filter((g) => g.ativo);
    const nDias = diasNoMes(ano, mes);

    const dias: DiaMes[] = [];
    for (let dia = 1; dia <= nDias; dia++) {
      const data = dataDoMes(ano, mes, dia);
      const dow = diaSemanaDe(data);
      const slots = gradeAtiva.filter((g) => g.dia_semana === dow);
      const capacidade = slots.reduce((sum, g) => sum + (g.capacidade ?? capPadrao), 0);

      const doDia = s.reservas.filter((r) => r.unidade_id === unidadeId && r.data === data);
      const itens: ItemMes[] = doDia
        .filter((r) => r.status !== 'cancelado')
        .map((r) => ({
          hora: r.hora,
          nome: s.aluno(r.alunoId).nome,
          tipo: r.tipo_no_dia,
          fixo: r.origem === 'fixo',
          previsto: false,
          status: r.status,
        }));

      // fixos projetados nos dias ainda não materializados (mesma regra do materializarDia)
      for (const g of slots) {
        for (const alunoId of s.fixos.get(`${unidadeId}|${dow}|${g.hora}`) ?? []) {
          if (doDia.some((r) => r.hora === g.hora && r.alunoId === alunoId)) continue;
          const a = s.aluno(alunoId);
          itens.push({
            hora: g.hora,
            nome: a.nome,
            tipo: a.tipo,
            fixo: true,
            previsto: true,
            status: 'reservado',
          });
        }
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
      dias.push({ data, capacidade, itens });
    }
    return dias;
  }

  async marcar(p: {
    unidadeId: string;
    dataISO: string;
    hora: number;
    alunoId: string;
    fixo?: boolean;
  }): Promise<ResultadoMarcacao> {
    await espera();
    const s = st();
    if (s.vagas(p.unidadeId, p.dataISO, p.hora) <= 0) return { ok: false, erro: 'Turma completa.' };
    if (s.slotReservas(p.unidadeId, p.dataISO, p.hora).some((r) => r.alunoId === p.alunoId)) {
      return { ok: false, erro: 'Aluno já está nesse horário.' };
    }
    const aluno = s.aluno(p.alunoId);
    const wd = new Date(p.dataISO + 'T12:00:00').getDay();
    if (p.fixo) {
      const k = `${p.unidadeId}|${wd}|${p.hora}`;
      const lista = s.fixos.get(k) ?? [];
      if (!lista.includes(p.alunoId)) lista.push(p.alunoId);
      s.fixos.set(k, lista);
      // materializa nas próximas 2 semanas já geradas
      for (let off = 0; off <= 13; off++) {
        const d = dateFor(off);
        if (iso(d) === p.dataISO || (d.getDay() === wd && iso(d) > p.dataISO)) {
          const data = iso(d);
          if (
            s.vagas(p.unidadeId, data, p.hora) > 0 &&
            !s.reservas.some(
              (r) =>
                r.unidade_id === p.unidadeId &&
                r.data === data &&
                r.hora === p.hora &&
                r.alunoId === p.alunoId
            )
          ) {
            s.reservas.push({
              id: s.novoId('r'),
              unidade_id: p.unidadeId,
              data,
              hora: p.hora,
              alunoId: p.alunoId,
              tipo_no_dia: aluno.tipo,
              origem: 'fixo',
              status: 'reservado',
            });
          }
        }
      }
    } else {
      s.reservas.push({
        id: s.novoId('r'),
        unidade_id: p.unidadeId,
        data: p.dataISO,
        hora: p.hora,
        alunoId: p.alunoId,
        tipo_no_dia: aluno.tipo,
        origem: 'manual',
        status: 'reservado',
      });
    }
    this.notify();
    return { ok: true };
  }

  async setStatus(reservaId: string, status: StatusReserva): Promise<void> {
    await espera(60);
    const r = st().reservas.find((x) => x.id === reservaId);
    if (r) r.status = status;
    this.notify();
  }

  async cancelar(reserva: Reserva): Promise<void> {
    await espera(60);
    const r = st().reservas.find((x) => x.id === reserva.id);
    if (r) {
      r.status = 'cancelado';
      if (r.origem === 'fixo') r.ausencia = true;
    }
    this.notify();
  }

  async encerrarFixo(reserva: Reserva): Promise<void> {
    await espera(60);
    const s = st();
    const r = s.reservas.find((x) => x.id === reserva.id);
    if (!r) return;
    r.status = 'cancelado';
    const wd = new Date(r.data + 'T12:00:00').getDay();
    const k = `${r.unidade_id}|${wd}|${r.hora}`;
    s.fixos.set(k, (s.fixos.get(k) ?? []).filter((id) => id !== r.alunoId));
    // remove reservas futuras desse fixo
    for (const fr of s.reservas) {
      if (
        fr.unidade_id === r.unidade_id &&
        fr.hora === r.hora &&
        fr.alunoId === r.alunoId &&
        fr.origem === 'fixo' &&
        fr.data > r.data &&
        fr.status === 'reservado'
      ) {
        fr.status = 'cancelado';
      }
    }
    this.notify();
  }

  async listAlunos(): Promise<Aluno[]> {
    await espera(60);
    return [...st().alunos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  }

  async buscarAlunos(q: string): Promise<Aluno[]> {
    const n = norm(q);
    const todos = await this.listAlunos();
    if (!n) return todos.slice(0, 8);
    return todos.filter((a) => norm(a.nome).includes(n)).slice(0, 8);
  }

  async criarAluno(p: { nome: string; tipo: TipoAluno; telefone?: string }): Promise<Aluno> {
    await espera(60);
    const a = st().criarAlunoInterno(p.nome, p.tipo, p.telefone ?? undefined);
    if (!p.telefone) a.telefone = null;
    this.notify();
    return a;
  }

  async atualizarAluno(
    id: string,
    patch: Partial<Pick<Aluno, 'nome' | 'telefone' | 'tipo' | 'observacoes' | 'ativo'>>
  ): Promise<void> {
    await espera(60);
    const a = st().alunos.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
    this.notify();
  }

  async proximasDoAluno(alunoId: string): Promise<ProximaAula[]> {
    await espera(60);
    const s = st();
    const hoje = iso(dateFor(0));
    return s.reservas
      .filter((r) => r.alunoId === alunoId && r.status !== 'cancelado' && r.data >= hoje)
      .sort((a, b) => (a.data === b.data ? a.hora - b.hora : a.data < b.data ? -1 : 1))
      .slice(0, 5)
      .map((r) => ({
        data: r.data,
        hora: r.hora,
        unidadeNome: s.unidades.find((u) => u.id === r.unidade_id)?.nome ?? '',
        status: r.status,
      }));
  }

  async grade(unidadeId: string): Promise<GradeItem[]> {
    await espera(40);
    return [...(st().grade.get(unidadeId) ?? [])];
  }

  async toggleGrade(unidadeId: string, dia: number, hora: number, ativo: boolean): Promise<void> {
    await espera(40);
    const itens = st().grade.get(unidadeId) ?? [];
    const item = itens.find((g) => g.dia_semana === dia && g.hora === hora);
    if (item) item.ativo = ativo;
    else itens.push({ dia_semana: dia, hora, capacidade: null, ativo });
    st().grade.set(unidadeId, itens);
    this.notify();
  }

  async salvarUnidade(u: Unidade): Promise<void> {
    await espera(40);
    const atual = st().unidades.find((x) => x.id === u.id);
    if (atual) Object.assign(atual, u);
    this.notify();
  }

  async criarUnidade(p: { nome: string; capacidade: number }): Promise<Unidade> {
    await espera(40);
    const s = st();
    const u: Unidade = { id: s.novoId('u'), nome: p.nome, capacidade_padrao: p.capacidade };
    s.unidades.push(u);
    s.grade.set(u.id, []);
    this.notify();
    return u;
  }

  async excluirUnidade(id: string): Promise<void> {
    await espera(40);
    const s = st();
    s.unidades = s.unidades.filter((u) => u.id !== id);
    this.notify();
  }

  onReservasChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async login(): Promise<string | null> {
    return null;
  }

  async logout(): Promise<void> {
    /* demo */
  }

  async sessionInfo(): Promise<Sessao | null> {
    return { nome: 'Demonstração', papel: 'admin', email: 'demo@agenda' };
  }
}
