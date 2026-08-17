import type { AgendaRepo } from './repo';
import { Unidade } from './types';
import { DIAS_ABR, DIAS_LONGO, dateFor, horaFmt, iso, nomeDia } from './dates';
import { norm, titleCase } from './text';

/* ============================================================
   Assistente LOCAL — parser simples de fallback, usado quando não
   há ANTHROPIC_API_KEY (ex.: modo demo). Entende comandos como:
   - "marca a Maria amanhã às 7h30 no Centro"
   - "desmarca o João de hoje 18h30"
   - "quais vagas tem amanhã de manhã?"
   A versão completa (aba conectada à Claude API) vive em
   app/api/assistente/route.ts.
   ============================================================ */

export interface RespostaLocal {
  texto: string;
  acao: boolean; // true = mexeu na agenda (a tela deve atualizar)
}

const AJUDA =
  'Não entendi. Tente algo como:\n• "marca a Maria amanhã às 7h30"\n• "desmarca o João de hoje 18h30"\n• "quais vagas tem amanhã de manhã?"';

/** offset de dias a partir do texto; null se não achou referência */
function parseData(t: string): { off: number; resto: string } {
  let off = 0;
  let resto = t;
  if (/\bdepois de amanha\b/.test(t)) {
    off = 2;
    resto = t.replace(/\bdepois de amanha\b/, ' ');
  } else if (/\bamanha\b/.test(t)) {
    off = 1;
    resto = t.replace(/\bamanha\b/, ' ');
  } else if (/\bhoje\b/.test(t)) {
    off = 0;
    resto = t.replace(/\bhoje\b/, ' ');
  } else {
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    for (let d = 0; d < 7; d++) {
      const re = new RegExp(`\\b${dias[d]}(-feira)?\\b`);
      if (re.test(t)) {
        const hojeDow = dateFor(0).getDay();
        off = (d - hojeDow + 7) % 7 || 7;
        resto = t.replace(re, ' ');
        break;
      }
    }
  }
  return { off, resto };
}

/** minutos do dia a partir de "7h30" | "07:30" | "às 7" (arredonda p/ meia hora seguinte); null se não achou */
function parseHora(t: string): { min: number | null; resto: string } {
  const m = t.match(/\b(?:as\s+)?(\d{1,2})\s*[h:]\s*(\d{2})?\b/);
  if (!m) return { min: null, resto: t };
  const h = parseInt(m[1], 10);
  const mm = m[2] != null ? parseInt(m[2], 10) : 30; // "às 7" → 07:30 (turmas nas meias horas)
  return { min: h * 60 + mm, resto: t.replace(m[0], ' ') };
}

function parseUnidade(t: string, unidades: Unidade[]): { unidade: Unidade | null; resto: string } {
  for (const u of unidades) {
    const n = norm(u.nome);
    const re = new RegExp(`\\b(na|no|em|unidade)\\s+${n}\\b`);
    const m = t.match(re);
    if (m) return { unidade: u, resto: t.replace(m[0], ' ') };
  }
  return { unidade: null, resto: t };
}

function limpaNome(t: string): string {
  return t
    .replace(/\b(a|o|as|os|para|pra|de|da|do|na|no|em|as|aula|aluna|aluno)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function assistenteLocal(
  repo: AgendaRepo,
  unidades: Unidade[],
  unidadeAtual: Unidade | null,
  entrada: string
): Promise<RespostaLocal> {
  let t = ' ' + norm(entrada).replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';

  const querDesmarcar = /\b(desmarca|desmarcar|cancela|cancelar|tira|tirar|remove|remover)\b/.test(t);
  const querMarcar =
    !querDesmarcar && /\b(marca|marcar|agenda|agendar|coloca|colocar|bota|inclui|incluir)\b/.test(t);
  const querVagas = !querDesmarcar && !querMarcar && /\b(vaga|vagas|horario|horarios|livre|agenda)\b/.test(t);

  if (!querDesmarcar && !querMarcar && !querVagas) return { texto: AJUDA, acao: false };

  const u1 = parseUnidade(t, unidades);
  const unidade = u1.unidade ?? unidadeAtual;
  t = u1.resto;
  if (!unidade) return { texto: 'Não sei em qual unidade — selecione uma no topo da tela.', acao: false };

  const d1 = parseData(t);
  const off = d1.off;
  t = d1.resto;
  const dataISO = iso(dateFor(off));

  // ---- consultar vagas ----
  if (querVagas) {
    const manha = /\bmanha\b/.test(t);
    const tarde = /\b(tarde|noite)\b/.test(t);
    const slots = await repo.agendaDia(unidade.id, dataISO);
    const filtrados = slots.filter(
      (s) => (!manha || s.hora < 12 * 60) && (!tarde || s.hora >= 12 * 60)
    );
    if (!filtrados.length) return { texto: `Sem turmas ${nomeDia(off)} na ${unidade.nome}.`, acao: false };
    const linhas = filtrados.map((s) => {
      const livres = s.capacidade - s.reservas.length;
      return livres > 0
        ? `• ${horaFmt(s.hora)} — ${livres} vaga${livres === 1 ? '' : 's'}`
        : `• ${horaFmt(s.hora)} — lotado`;
    });
    return {
      texto: `Vagas de ${nomeDia(off)} na ${unidade.nome}:\n${linhas.join('\n')}`,
      acao: false,
    };
  }

  const h1 = parseHora(t);
  t = h1.resto;
  if (h1.min == null) {
    return { texto: 'Qual horário? Diga por exemplo "às 7h30".', acao: false };
  }
  const hora = h1.min;

  // o que sobrou depois do verbo é o nome do aluno
  const aposVerbo = t.replace(
    /^.*?\b(desmarca|desmarcar|cancela|cancelar|tira|tirar|remove|remover|marca|marcar|agenda|agendar|coloca|colocar|bota|inclui|incluir)\b/,
    ' '
  );
  const nome = limpaNome(aposVerbo);
  if (nome.length < 2) return { texto: 'Não entendi o nome do aluno. ' + AJUDA, acao: false };

  const slots = await repo.agendaDia(unidade.id, dataISO);
  const slot = slots.find((s) => s.hora === hora);
  if (!slot) {
    const dow = dateFor(off).getDay();
    return {
      texto: `Não há turma às ${horaFmt(hora)} na ${DIAS_LONGO[dow].toLowerCase()} (${DIAS_ABR[dow]}) na ${unidade.nome}. Horários do dia: ${slots.map((s) => horaFmt(s.hora)).join(', ') || 'nenhum'}.`,
      acao: false,
    };
  }

  // ---- desmarcar ----
  if (querDesmarcar) {
    const reserva = slot.reservas.find((r) => norm(r.aluno.nome).includes(nome));
    if (!reserva) {
      return {
        texto: `Não achei "${titleCase(nome)}" na turma das ${horaFmt(hora)} de ${nomeDia(off)}.`,
        acao: false,
      };
    }
    await repo.cancelar(reserva);
    return {
      texto:
        reserva.origem === 'fixo'
          ? `Ausência registrada para ${reserva.aluno.nome} ${nomeDia(off)} às ${horaFmt(hora)} — vaga liberada só nesse dia (o fixo continua).`
          : `Desmarcado: ${reserva.aluno.nome}, ${nomeDia(off)} às ${horaFmt(hora)}. Vaga liberada.`,
      acao: true,
    };
  }

  // ---- marcar ----
  const encontrados = await repo.buscarAlunos(nome);
  let aluno = encontrados.find((a) => norm(a.nome) === nome) ?? encontrados[0];
  let cadastrado = false;
  if (!aluno) {
    aluno = await repo.criarAluno({ nome: titleCase(nome), tipo: 'wellhub' });
    cadastrado = true;
  }
  const res = await repo.marcar({
    unidadeId: unidade.id,
    dataISO,
    hora,
    alunoId: aluno.id,
    origem: 'assistente',
  });
  if (!res.ok) return { texto: `Não deu: ${res.erro}`, acao: cadastrado };
  return {
    texto:
      `Marcado: ${aluno.nome}, ${nomeDia(off)} às ${horaFmt(hora)} na ${unidade.nome} ✓` +
      (cadastrado ? ' (aluno novo cadastrado como Wellhub)' : ''),
    acao: true,
  };
}
