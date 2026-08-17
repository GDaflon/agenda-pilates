import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { norm } from '@/lib/text';

/* ============================================================
   POST /api/assistente — assistente de agenda com Claude API.

   Segurança:
   - ANTHROPIC_API_KEY só existe no servidor (nunca NEXT_PUBLIC).
   - O chamador manda o access token Supabase (Authorization: Bearer)
     e o client é criado com esse token → as policies (RLS) valem.
   - Nenhuma lógica de agenda nova aqui: as ferramentas chamam as
     mesmas funções SQL do app (gerar_dia, vagas_do_dia,
     marcar_reserva, registrar_ausencia).
   ============================================================ */

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

export async function GET() {
  return Response.json({ configurado: !!process.env.ANTHROPIC_API_KEY });
}

interface MsgChat {
  role: 'user' | 'assistant';
  content: string;
}

interface UnidadeRow {
  id: string;
  nome: string;
}

/** 330 → "05h30" */
function horaFmt(min: number): string {
  return String(Math.floor(min / 60)).padStart(2, '0') + 'h' + String(min % 60).padStart(2, '0');
}

/** "05:30:00" | "05:30" → 330 */
function horaMin(v: string): number {
  return parseInt(v.slice(0, 2), 10) * 60 + parseInt(v.slice(3, 5) || '0', 10);
}

/** "05:30" | "5h30" | "5h" → "05:30" (formato time) */
function horaSqlDe(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[h:]?(\d{2})?/i);
  if (!m) return null;
  return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + (m[2] ?? '00');
}

function traduzErro(msg: string): string {
  if (msg.includes('sem_vaga')) return 'A turma está completa — sem vaga nesse horário.';
  if (msg.includes('horario_inexistente')) return 'Esse horário não existe na grade da unidade.';
  if (msg.includes('reserva_unica') || msg.includes('duplicate key'))
    return 'O aluno já está marcado nesse horário.';
  if (msg.includes('ja_fixo')) return 'O aluno já tem horário fixo nessa turma.';
  return msg;
}

async function resolveUnidade(
  sb: SupabaseClient,
  unidades: UnidadeRow[],
  nome: string | undefined,
  padraoId: string | undefined
): Promise<UnidadeRow | null> {
  if (nome) {
    const n = norm(nome);
    const achada = unidades.find((u) => norm(u.nome).includes(n) || n.includes(norm(u.nome)));
    if (achada) return achada;
    return null;
  }
  if (padraoId) {
    const padrao = unidades.find((u) => u.id === padraoId);
    if (padrao) return padrao;
  }
  return unidades.length === 1 ? unidades[0] : null;
}

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'listar_vagas',
    description:
      'Lista os horários de um dia em uma unidade, com vagas livres e turmas lotadas. Use antes de marcar quando não souber se há vaga, ou quando perguntarem sobre vagas/horários.',
    input_schema: {
      type: 'object',
      properties: {
        unidade: { type: 'string', description: 'Nome da unidade (ex.: "Centro"). Omita para usar a unidade atual.' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
      },
      required: ['data'],
    },
  },
  {
    name: 'marcar_aluno',
    description:
      'Marca um aluno em uma turma. Se o aluno não existir no cadastro, ele é criado automaticamente (tipo padrão: wellhub).',
    input_schema: {
      type: 'object',
      properties: {
        unidade: { type: 'string', description: 'Nome da unidade. Omita para usar a unidade atual.' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        hora: { type: 'string', description: 'Horário da turma no formato HH:MM (ex.: "07:30")' },
        nome: { type: 'string', description: 'Nome do aluno' },
        tipo: {
          type: 'string',
          enum: ['mensalista', 'wellhub', 'totalpass'],
          description: 'Tipo do aluno caso precise ser cadastrado (padrão: wellhub)',
        },
      },
      required: ['data', 'hora', 'nome'],
    },
  },
  {
    name: 'desmarcar_aluno',
    description:
      'Desmarca um aluno de uma turma em uma data. Se a reserva vier de horário fixo, registra ausência (a vaga é liberada só naquele dia).',
    input_schema: {
      type: 'object',
      properties: {
        unidade: { type: 'string', description: 'Nome da unidade. Omita para usar a unidade atual.' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        hora: { type: 'string', description: 'Horário da turma no formato HH:MM (ex.: "18:30")' },
        nome: { type: 'string', description: 'Nome do aluno' },
      },
      required: ['data', 'hora', 'nome'],
    },
  },
];

async function executaFerramenta(
  sb: SupabaseClient,
  unidades: UnidadeRow[],
  unidadePadraoId: string | undefined,
  nome: string,
  input: Record<string, string | undefined>
): Promise<{ texto: string; mudouAgenda: boolean }> {
  const unidade = await resolveUnidade(sb, unidades, input.unidade, unidadePadraoId);
  if (!unidade) {
    return {
      texto: `Não encontrei a unidade. Unidades disponíveis: ${unidades.map((u) => u.nome).join(', ')}.`,
      mudouAgenda: false,
    };
  }

  if (nome === 'listar_vagas') {
    const data = input.data!;
    await sb.rpc('gerar_dia', { p_unidade: unidade.id, p_data: data });
    const { data: vagas, error } = await sb.rpc('vagas_do_dia', { p_unidade: unidade.id, p_data: data });
    if (error) return { texto: 'Erro ao consultar vagas: ' + error.message, mudouAgenda: false };
    type VagaRow = { hora: string; capacidade: number; ocupadas: number; livres: number };
    const linhas = (((vagas as unknown as VagaRow[]) ?? []).map((v) =>
      v.livres > 0
        ? `${horaFmt(horaMin(v.hora))}: ${v.livres} vaga(s) livre(s) (${v.ocupadas}/${v.capacidade})`
        : `${horaFmt(horaMin(v.hora))}: LOTADO (${v.ocupadas}/${v.capacidade})`
    ));
    if (!linhas.length) return { texto: `Sem turmas em ${data} na unidade ${unidade.nome}.`, mudouAgenda: false };
    return { texto: `Turmas de ${data} — ${unidade.nome}:\n` + linhas.join('\n'), mudouAgenda: false };
  }

  const horaSql = horaSqlDe(input.hora ?? '');
  if (!horaSql) return { texto: 'Horário inválido — use o formato HH:MM.', mudouAgenda: false };

  if (nome === 'marcar_aluno') {
    // busca o aluno; cadastra se não existir
    const { data: candidatos, error: e1 } = await sb
      .from('aluno')
      .select('id,nome,tipo')
      .eq('ativo', true)
      .ilike('nome', `%${input.nome!.trim()}%`)
      .limit(5);
    if (e1) return { texto: 'Erro ao buscar aluno: ' + e1.message, mudouAgenda: false };

    let aluno = (candidatos ?? []).find((a) => norm(a.nome) === norm(input.nome!)) ?? candidatos?.[0];
    let cadastrado = false;
    if (!aluno) {
      const { data: novo, error: e2 } = await sb
        .from('aluno')
        .insert({ nome: input.nome!.trim(), tipo: input.tipo ?? 'wellhub' })
        .select('id,nome,tipo')
        .single();
      if (e2) return { texto: 'Erro ao cadastrar aluno: ' + e2.message, mudouAgenda: false };
      aluno = novo;
      cadastrado = true;
    }

    const { error: e3 } = await sb.rpc('marcar_reserva', {
      p_unidade: unidade.id,
      p_data: input.data!,
      p_hora: horaSql,
      p_aluno: aluno!.id,
      p_origem: 'assistente',
    });
    if (e3) return { texto: `Não consegui marcar: ${traduzErro(e3.message)}`, mudouAgenda: cadastrado };
    return {
      texto:
        `Marcado: ${aluno!.nome} em ${input.data} às ${horaFmt(horaMin(horaSql))} na ${unidade.nome}.` +
        (cadastrado ? ` (aluno novo cadastrado como ${input.tipo ?? 'wellhub'})` : ''),
      mudouAgenda: true,
    };
  }

  if (nome === 'desmarcar_aluno') {
    const { data: candidatos, error: e1 } = await sb
      .from('aluno')
      .select('id,nome')
      .ilike('nome', `%${input.nome!.trim()}%`)
      .limit(5);
    if (e1) return { texto: 'Erro ao buscar aluno: ' + e1.message, mudouAgenda: false };
    const aluno = (candidatos ?? []).find((a) => norm(a.nome) === norm(input.nome!)) ?? candidatos?.[0];
    if (!aluno) return { texto: `Não encontrei aluno chamado "${input.nome}".`, mudouAgenda: false };

    const { data: reservas, error: e2 } = await sb
      .from('reserva')
      .select('id,origem,hora')
      .eq('unidade_id', unidade.id)
      .eq('data', input.data!)
      .eq('hora', horaSql)
      .eq('aluno_id', aluno.id)
      .neq('status', 'cancelado')
      .limit(1);
    if (e2) return { texto: 'Erro ao buscar a reserva: ' + e2.message, mudouAgenda: false };
    const reserva = reservas?.[0];
    if (!reserva) {
      return {
        texto: `${aluno.nome} não está marcado(a) em ${input.data} às ${horaFmt(horaMin(horaSql))} na ${unidade.nome}.`,
        mudouAgenda: false,
      };
    }

    const { error: e3 } = await sb.rpc('registrar_ausencia', { p_reserva: reserva.id });
    if (e3) return { texto: 'Erro ao desmarcar: ' + traduzErro(e3.message), mudouAgenda: false };
    return {
      texto:
        reserva.origem === 'fixo'
          ? `Ausência registrada para ${aluno.nome} em ${input.data} às ${horaFmt(horaMin(horaSql))} — a vaga foi liberada só nesse dia (o fixo continua nas próximas semanas).`
          : `Desmarcado: ${aluno.nome} de ${input.data} às ${horaFmt(horaMin(horaSql))} na ${unidade.nome}. Vaga liberada.`,
      mudouAgenda: true,
    };
  }

  return { texto: `Ferramenta desconhecida: ${nome}`, mudouAgenda: false };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ erro: 'sem_chave' }, { status: 503 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return Response.json({ erro: 'sem_supabase' }, { status: 503 });
  }

  // auth: exige o access token do usuário logado; RLS vale para todas as queries
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const sb = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !userData.user) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  let corpo: { mensagens?: MsgChat[]; unidadeId?: string };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: 'corpo_invalido' }, { status: 400 });
  }
  const historico = (corpo.mensagens ?? []).slice(-16);
  if (!historico.length || historico[historico.length - 1].role !== 'user') {
    return Response.json({ erro: 'sem_mensagem' }, { status: 400 });
  }

  const { data: unidadesData, error: uErr } = await sb
    .from('unidade')
    .select('id,nome')
    .eq('ativo', true)
    .order('nome');
  if (uErr) return Response.json({ erro: uErr.message }, { status: 500 });
  const unidades = (unidadesData ?? []) as UnidadeRow[];
  if (!unidades.length) return Response.json({ erro: 'sem_acesso' }, { status: 403 });

  const agora = new Date();
  const dataHora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(agora);
  const dataISO = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  const unidadeAtual = unidades.find((u) => u.id === corpo.unidadeId);

  const system =
    `Você é o assistente de agenda do Natty Estúdio Pilates, usado pela equipe (professoras e dona) para operar a agenda por texto ou voz, em português.\n\n` +
    `Agora: ${dataHora} (America/Sao_Paulo). Data de hoje em ISO: ${dataISO}.\n` +
    `Unidades do estúdio: ${unidades.map((u) => u.nome).join(', ')}.` +
    (unidadeAtual ? ` Unidade selecionada na tela: ${unidadeAtual.nome} (use-a quando não citarem unidade).` : '') +
    `\n\nUse as ferramentas para consultar vagas, marcar e desmarcar alunos. ` +
    `Converta expressões como "amanhã", "sexta" e "7h30" para data ISO (YYYY-MM-DD) e hora HH:MM. ` +
    `As turmas começam nas meias horas (05:30, 06:30, …); se disserem "às 7", interprete como 07:30 e confirme na resposta. ` +
    `Responda curto e direto, confirmando exatamente o que fez (aluno, data, horário, unidade). ` +
    `Se algo falhar (sem vaga, aluno não encontrado), explique em uma frase e sugira o próximo passo.`;

  const client = new Anthropic();
  const mensagens: Anthropic.MessageParam[] = historico.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let houveAcao = false;
  try {
    for (let volta = 0; volta < 6; volta++) {
      const resposta = await client.messages.create({
        model: MODELO,
        max_tokens: 2048,
        system,
        tools: FERRAMENTAS,
        messages: mensagens,
      });

      if (resposta.stop_reason !== 'tool_use') {
        const texto = resposta.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return Response.json({ resposta: texto || 'Certo!', houveAcao });
      }

      mensagens.push({ role: 'assistant', content: resposta.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== 'tool_use') continue;
        const r = await executaFerramenta(
          sb,
          unidades,
          corpo.unidadeId,
          bloco.name,
          bloco.input as Record<string, string | undefined>
        );
        if (r.mudouAgenda) houveAcao = true;
        resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: r.texto });
      }
      mensagens.push({ role: 'user', content: resultados });
    }
    return Response.json({
      resposta: 'Fiz várias operações mas a conversa ficou longa demais — confira a agenda.',
      houveAcao,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro desconhecido';
    return Response.json({ erro: 'Falha ao falar com a IA: ' + msg }, { status: 502 });
  }
}
