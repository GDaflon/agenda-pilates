import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { custoUsd, inicioDoMesISO, limiteMensalUsd } from '@/lib/precosIa';

/* ============================================================
   POST /api/assistente — assistente de agenda com Claude API.

   Segurança:
   - ANTHROPIC_API_KEY só existe no servidor (nunca NEXT_PUBLIC).
   - O chamador manda o access token Supabase (Authorization: Bearer);
     o token é validado no servidor (auth.getUser + perfil) e o client
     de agenda é criado COM esse token → as policies (RLS) valem.
   - Nenhuma lógica de agenda nova aqui: as ferramentas chamam as
     mesmas funções SQL do app (gerar_dia, vagas_do_dia,
     marcar_reserva, registrar_ausencia).
   ============================================================ */

export const runtime = 'nodejs';

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MAX_RODADAS = 4; // rodadas de tool use por comando
const MAX_HISTORICO = 10; // mensagens de histórico aceitas do front

export async function GET() {
  return Response.json({
    configurado: !!process.env.ANTHROPIC_API_KEY,
    limiteUsd: limiteMensalUsd(),
  });
}

/** soma o custo do mês corrente na uso_ia (via service role) */
async function gastoDoMes(servico: SupabaseClient): Promise<number> {
  const { data, error } = await servico
    .from('uso_ia')
    .select('custo_usd')
    .gte('criado_em', inicioDoMesISO());
  if (error) return 0;
  return (data ?? []).reduce((s, r) => s + Number(r.custo_usd), 0);
}

interface MsgChat {
  role: 'user' | 'assistant';
  content: string;
}

interface UnidadeRow {
  id: string;
  nome: string;
}

interface VagaRow {
  hora: string;
  capacidade: number;
  ocupadas: number;
  livres: number;
}

/** 330 → "05h30" */
function horaFmt(min: number): string {
  return String(Math.floor(min / 60)).padStart(2, '0') + 'h' + String(min % 60).padStart(2, '0');
}

/** "05:30:00" | "05:30" → 330 */
function horaMin(v: string): number {
  return parseInt(v.slice(0, 2), 10) * 60 + parseInt(v.slice(3, 5) || '0', 10);
}

/** "05:30" | "5h30" | "5h" → "05:30" (formato time do Postgres) */
function horaSqlDe(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[h:]?(\d{2})?$/i);
  if (!m) return null;
  return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + (m[2] ?? '00');
}

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'listar_vagas',
    description:
      'Lista todos os horários de um dia em uma unidade, com capacidade, ocupadas e vagas livres (turmas lotadas incluídas). Use para responder perguntas de vagas e antes de marcar quando não souber se há vaga.',
    input_schema: {
      type: 'object',
      properties: {
        unidade_id: { type: 'string', description: 'id da unidade (da lista do system prompt)' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
      },
      required: ['unidade_id', 'data'],
    },
  },
  {
    name: 'buscar_aluno',
    description:
      'Busca alunos cadastrados pelo nome (busca parcial, sem acento). Retorna candidatos com id, nome e tipo. Use SEMPRE antes de marcar ou desmarcar: se vier mais de um candidato compatível, PERGUNTE ao usuário qual é; se vier vazio, confirme se deve cadastrar como aluno novo.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome (ou parte do nome) do aluno' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'marcar_aluno',
    description:
      'Marca um aluno em uma turma. Informe aluno_id (obtido com buscar_aluno) OU nome_novo para cadastrar um aluno que não existe (tipo padrão: wellhub). Nunca use nome_novo se buscar_aluno encontrou o aluno.',
    input_schema: {
      type: 'object',
      properties: {
        unidade_id: { type: 'string', description: 'id da unidade' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        hora: { type: 'string', description: 'Horário da turma no formato HH:MM (ex.: "07:30")' },
        aluno_id: { type: 'string', description: 'id do aluno já cadastrado' },
        nome_novo: { type: 'string', description: 'Nome completo do aluno a cadastrar (só se não existir)' },
        tipo: {
          type: 'string',
          enum: ['mensalista', 'wellhub', 'totalpass'],
          description: 'Tipo do aluno novo (padrão: wellhub)',
        },
      },
      required: ['unidade_id', 'data', 'hora'],
    },
  },
  {
    name: 'desmarcar_aluno',
    description:
      'Desmarca um aluno de uma turma em uma data (aluno_id via buscar_aluno). Se a reserva vier de horário fixo, vira ausência só daquele dia — o fixo continua nas próximas semanas.',
    input_schema: {
      type: 'object',
      properties: {
        unidade_id: { type: 'string', description: 'id da unidade' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        hora: { type: 'string', description: 'Horário da turma no formato HH:MM' },
        aluno_id: { type: 'string', description: 'id do aluno' },
      },
      required: ['unidade_id', 'data', 'hora', 'aluno_id'],
    },
  },
];

/** vagas do dia como texto para o modelo (inclui lotados) */
async function vagasTexto(sb: SupabaseClient, unidadeId: string, data: string): Promise<string> {
  await sb.rpc('gerar_dia', { p_unidade: unidadeId, p_data: data });
  const { data: vagas, error } = await sb.rpc('vagas_do_dia', { p_unidade: unidadeId, p_data: data });
  if (error) return 'erro ao consultar vagas: ' + error.message;
  const linhas = (((vagas as unknown as VagaRow[]) ?? []).map((v) =>
    v.livres > 0
      ? `${horaFmt(horaMin(v.hora))}: ${v.livres} livre(s) de ${v.capacidade}`
      : `${horaFmt(horaMin(v.hora))}: LOTADO (${v.ocupadas}/${v.capacidade})`
  ));
  return linhas.length ? linhas.join('; ') : 'nenhuma turma nesse dia';
}

/** vagas livres de um horário específico (para "restam N vagas" na confirmação) */
async function vagasDoSlot(
  sb: SupabaseClient,
  unidadeId: string,
  data: string,
  horaSql: string
): Promise<number | null> {
  const { data: vagas } = await sb.rpc('vagas_do_dia', { p_unidade: unidadeId, p_data: data });
  const slot = ((vagas as unknown as VagaRow[]) ?? []).find((v) => horaMin(v.hora) === horaMin(horaSql));
  return slot ? slot.livres : null;
}

async function executaFerramenta(
  sb: SupabaseClient,
  unidades: UnidadeRow[],
  nome: string,
  input: Record<string, string | undefined>
): Promise<{ texto: string; mudouAgenda: boolean }> {
  if (nome === 'buscar_aluno') {
    const termo = (input.nome ?? '').trim();
    if (termo.length < 2) return { texto: 'informe pelo menos 2 letras do nome', mudouAgenda: false };
    const { data, error } = await sb
      .from('aluno')
      .select('id,nome,tipo')
      .eq('ativo', true)
      .ilike('nome', `%${termo}%`)
      .order('nome')
      .limit(8);
    if (error) return { texto: 'erro ao buscar aluno: ' + error.message, mudouAgenda: false };
    if (!data?.length) {
      return {
        texto: `nenhum aluno cadastrado com "${termo}" — cadastre direto com marcar_aluno usando nome_novo (tipo padrão wellhub) e AVISE na resposta que o aluno foi criado`,
        mudouAgenda: false,
      };
    }
    return {
      texto:
        'candidatos:\n' + data.map((a) => `- id=${a.id} | ${a.nome} | ${a.tipo}`).join('\n') +
        (data.length > 1 ? '\n(mais de um candidato: se o pedido não deixa claro qual é, pergunte ao usuário)' : ''),
      mudouAgenda: false,
    };
  }

  const unidade = unidades.find((u) => u.id === input.unidade_id);
  if (!unidade) {
    return {
      texto: `unidade_id inválido. Unidades: ${unidades.map((u) => `${u.nome} (id=${u.id})`).join(', ')}`,
      mudouAgenda: false,
    };
  }

  if (nome === 'listar_vagas') {
    const texto = await vagasTexto(sb, unidade.id, input.data!);
    return { texto: `${unidade.nome}, ${input.data}: ${texto}`, mudouAgenda: false };
  }

  const horaSql = horaSqlDe(input.hora ?? '');
  if (!horaSql) return { texto: 'horário inválido — use HH:MM', mudouAgenda: false };

  if (nome === 'marcar_aluno') {
    let alunoId = input.aluno_id;
    let alunoNome = '';
    let cadastrado = false;

    if (alunoId) {
      const { data: a } = await sb.from('aluno').select('id,nome').eq('id', alunoId).single();
      if (!a) return { texto: 'aluno_id não encontrado — use buscar_aluno', mudouAgenda: false };
      alunoNome = a.nome;
    } else if (input.nome_novo?.trim()) {
      const { data: novo, error } = await sb
        .from('aluno')
        .insert({ nome: input.nome_novo.trim(), tipo: input.tipo ?? 'wellhub' })
        .select('id,nome')
        .single();
      if (error) return { texto: 'erro ao cadastrar aluno: ' + error.message, mudouAgenda: false };
      alunoId = novo.id;
      alunoNome = novo.nome;
      cadastrado = true;
    } else {
      return { texto: 'informe aluno_id (via buscar_aluno) ou nome_novo', mudouAgenda: false };
    }

    const { error } = await sb.rpc('marcar_reserva', {
      p_unidade: unidade.id,
      p_data: input.data!,
      p_hora: horaSql,
      p_aluno: alunoId,
      p_origem: 'assistente',
    });
    if (error) {
      // erro claro + vagas do dia, para o modelo oferecer alternativas
      const vagas = await vagasTexto(sb, unidade.id, input.data!);
      const motivo = error.message.includes('sem_vaga')
        ? 'turma LOTADA nesse horário'
        : error.message.includes('reserva_unica') || error.message.includes('duplicate key')
          ? 'o aluno JÁ está marcado nesse horário'
          : error.message.includes('horario_inexistente')
            ? 'esse horário não existe na grade desse dia'
            : error.message;
      return {
        texto: `falhou: ${motivo}. Vagas do dia em ${unidade.nome}: ${vagas}` + (cadastrado ? ` (obs: o aluno ${alunoNome} foi cadastrado mesmo assim)` : ''),
        mudouAgenda: cadastrado,
      };
    }
    const livres = await vagasDoSlot(sb, unidade.id, input.data!, horaSql);
    return {
      texto:
        `marcado: ${alunoNome} em ${input.data} às ${horaFmt(horaMin(horaSql))} na ${unidade.nome}` +
        (livres != null ? `; restam ${livres} vaga(s) na turma` : '') +
        (cadastrado ? `; aluno NOVO cadastrado como ${input.tipo ?? 'wellhub'}` : ''),
      mudouAgenda: true,
    };
  }

  if (nome === 'desmarcar_aluno') {
    const { data: a } = await sb.from('aluno').select('id,nome').eq('id', input.aluno_id!).single();
    if (!a) return { texto: 'aluno_id não encontrado — use buscar_aluno', mudouAgenda: false };

    const { data: reservas, error } = await sb
      .from('reserva')
      .select('id,origem')
      .eq('unidade_id', unidade.id)
      .eq('data', input.data!)
      .eq('hora', horaSql)
      .eq('aluno_id', a.id)
      .neq('status', 'cancelado')
      .limit(1);
    if (error) return { texto: 'erro ao buscar a reserva: ' + error.message, mudouAgenda: false };
    const reserva = reservas?.[0];
    if (!reserva) {
      return {
        texto: `${a.nome} não está marcado(a) em ${input.data} às ${horaFmt(horaMin(horaSql))} na ${unidade.nome}`,
        mudouAgenda: false,
      };
    }

    const { error: e2 } = await sb.rpc('registrar_ausencia', { p_reserva: reserva.id });
    if (e2) return { texto: 'erro ao desmarcar: ' + e2.message, mudouAgenda: false };
    return {
      texto:
        reserva.origem === 'fixo'
          ? `ausência registrada para ${a.nome} em ${input.data} às ${horaFmt(horaMin(horaSql))} — vaga liberada SÓ nesse dia, o horário fixo continua nas próximas semanas`
          : `desmarcado: ${a.nome} de ${input.data} às ${horaFmt(horaMin(horaSql))} na ${unidade.nome}; vaga liberada`,
      mudouAgenda: true,
    };
  }

  return { texto: `ferramenta desconhecida: ${nome}`, mudouAgenda: false };
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

  // auth: token do usuário logado, validado no servidor; RLS vale nas queries
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const sb = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !userData.user) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  const { data: perfil } = await sb
    .from('perfil')
    .select('id,nome')
    .eq('id', userData.user.id)
    .single();
  if (!perfil) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  let corpo: { mensagens?: MsgChat[]; unidadeId?: string };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: 'corpo_invalido' }, { status: 400 });
  }
  const historico = (corpo.mensagens ?? []).slice(-MAX_HISTORICO);
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
    dateStyle: 'full', // dia da semana por extenso
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
    `Você é o assistente da agenda do Natty Estúdio Pilates, usado pela equipe (professoras e dona) por texto ou voz, em português.\n\n` +
    `Agora: ${dataHora} (America/Sao_Paulo). Hoje em ISO: ${dataISO}.\n` +
    `Unidades: ${unidades.map((u) => `${u.nome} (id=${u.id})`).join('; ')}.` +
    (unidadeAtual
      ? ` A unidade selecionada na tela é ${unidadeAtual.nome} (id=${unidadeAtual.id}) — use-a quando o usuário não citar unidade.`
      : '') +
    `\n\nRegras:\n` +
    `- As turmas começam em passos de 30 minutos (ex.: 07:30). "às 7" normalmente é 07:30 — confirme o horário exato na resposta.\n` +
    `- Tipos de aluno: mensalista, wellhub, totalpass.\n` +
    `- Converta "amanhã", "sexta", "7h30" etc. para data ISO (YYYY-MM-DD) e hora HH:MM antes de chamar ferramentas.\n` +
    `- Responda CURTO, confirmando dia, horário, unidade e vagas restantes.\n` +
    `- Quando algo estiver ambíguo (nome que bate com mais de um aluno, falta de dia, horário ou unidade), PERGUNTE em vez de adivinhar.\n` +
    `- Nunca invente dados de agenda ou de alunos — use sempre as ferramentas.\n` +
    `- Antes de marcar ou desmarcar, localize o aluno com buscar_aluno. Se a busca não encontrar NINGUÉM, cadastre direto com nome_novo (wellhub, salvo indicação) e avise que o aluno foi criado. Se encontrar mais de um compatível, pergunte qual é.\n` +
    `- Se o horário pedido estiver LOTADO, NÃO marque outro horário por conta própria: mostre as alternativas com vaga do dia e pergunte qual o usuário quer.\n` +
    `- Responda em texto puro, SEM markdown (nada de ** ou #) — o chat não formata; emojis podem.`;

  // ---- controle de custo (zero surpresa) ----
  // service role SÓ para a tabela uso_ia; a agenda continua no client com RLS
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const servico = serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  const limite = limiteMensalUsd();
  let gastoMes = servico ? await gastoDoMes(servico) : 0;
  if (servico && gastoMes >= limite) {
    return Response.json({
      resposta: `Limite mensal da IA atingido (US$ ${gastoMes.toFixed(2)} de US$ ${limite.toFixed(2)}) — ajuste IA_LIMITE_MENSAL_USD na Vercel para ampliar.`,
      houveAcao: false,
      limiteAtingido: true,
    });
  }

  const registraUso = async (usage: Anthropic.Usage) => {
    const custo = custoUsd(MODELO, usage.input_tokens, usage.output_tokens);
    gastoMes += custo;
    if (!servico) return;
    await servico.from('uso_ia').insert({
      usuario_id: userData.user.id,
      modelo: MODELO,
      tokens_entrada: usage.input_tokens,
      tokens_saida: usage.output_tokens,
      custo_usd: custo,
    });
  };

  const client = new Anthropic();
  const mensagens: Anthropic.MessageParam[] = historico.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let houveAcao = false;
  try {
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const resposta = await client.messages.create({
        model: MODELO,
        max_tokens: 600,
        system,
        tools: FERRAMENTAS,
        messages: mensagens,
      });
      await registraUso(resposta.usage);

      if (resposta.stop_reason !== 'tool_use') {
        let texto = resposta.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        // entre 80% e 100% do limite: aviso discreto do consumo
        if (servico && limite > 0 && gastoMes >= limite * 0.8 && gastoMes < limite) {
          texto += `\n\n💸 Uso da IA no mês: US$ ${gastoMes.toFixed(2)} de US$ ${limite.toFixed(2)}.`;
        }
        return Response.json({ resposta: texto || 'Certo!', houveAcao });
      }

      mensagens.push({ role: 'assistant', content: resposta.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== 'tool_use') continue;
        const r = await executaFerramenta(
          sb,
          unidades,
          bloco.name,
          bloco.input as Record<string, string | undefined>
        );
        if (r.mudouAgenda) houveAcao = true;
        resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: r.texto });
      }
      mensagens.push({ role: 'user', content: resultados });
    }
    // acabaram as rodadas de ferramenta: uma última chamada SEM ferramentas
    // só para o modelo confirmar em texto o que já foi feito
    const fecho = await client.messages.create({
      model: MODELO,
      max_tokens: 600,
      system,
      tools: FERRAMENTAS,
      tool_choice: { type: 'none' },
      messages: mensagens,
    });
    await registraUso(fecho.usage);
    const textoFecho = fecho.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return Response.json({
      resposta: textoFecho || 'Feito — confira a agenda para confirmar.',
      houveAcao,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro desconhecido';
    return Response.json({ erro: 'Falha ao falar com a IA: ' + msg }, { status: 502 });
  }
}
