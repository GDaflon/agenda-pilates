@AGENTS.md

# Agenda do Natty Estúdio Pilates

App Next.js 16 (App Router) + Supabase. Identidade visual em `branding/BRAND.md`
(nunca hex solto em componente — tokens no `:root` de `app/globals.css`).

## Comandos

- `npm run dev` — o `.env.local` decide o modo; `NEXT_PUBLIC_DEMO=1 npm run dev` força o demo (dados em memória, sem env nenhuma).
- `npm run build` — precisa passar limpo antes de qualquer push.
- `npm run lint` — há erros pré-existentes de `react-hooks/set-state-in-effect`; não introduza tipos novos de erro.

## Convenções que não estão óbvias no código

- **Janela de dias**: `DIAS_JANELA` (lib/dates.ts) = hoje + 7. Vale para Agenda e Vagas; o seletor é um carrossel com scroll-snap. `off` continua sendo o deslocamento em dias a partir de hoje, então `nomeDia`/`labelDia` e o filtro de horário passado (`off === 0`) seguem valendo sem mudança.
- **Encaixe**: `reserva.encaixe` marca quem entrou acima da capacidade (`marcar_reserva(..., p_encaixe => true)`). É sempre pontual — nunca vira fixo, e `vagas_do_dia` usa `greatest(0, …)` para vaga nunca ficar negativa. Para valer toda semana, sobe-se a capacidade do horário na Config.
- **Capacidade**: `grade_horario.capacidade` (por horário) prevalece sobre `unidade.capacidade_padrao` (hoje 6) — é o `coalesce` que `vagas_do_dia`/`marcar_reserva` fazem. A Config edita as duas; o `demoRepo` precisa respeitar a mesma precedência.
- **Horário = minutos do dia** (`hora: number`, 330 = 05:30) em todo o app; exibição "05h30" via `horaFmt`. O banco usa `time`; `horaNum`/`horaSql` em `lib/dates.ts` fazem a ponte. Turmas começam nas meias horas (grade padrão 05:30–11:30 e 15:30–19:30 seg–sex, 08:30–11:30 sáb).
- Toda a lógica de agenda mora nas funções SQL (`supabase/schema.sql`): `gerar_dia`, `vagas_do_dia`, `marcar_reserva`, `registrar_ausencia`, `criar_fixo`, `encerrar_fixo` (parte de uma reserva, fluxo da agenda) e `encerrar_vinculo` (parte do id do vínculo, fluxo da ficha do aluno — este também cancela as reservas futuras já materializadas). Rotas e telas só chamam essas funções — nunca duplique regra de capacidade/fixo no TS.
- `lib/repo.ts` é a interface única de dados; `demoRepo` (memória) e `supabaseRepo` precisam se manter equivalentes.
- Papéis: `dono` (vê a aba Config — unidades, grade, equipe, uso da IA) e `professora` (opera a agenda; sem Config). A checagem de verdade é no servidor/RLS (`is_dono()`, `/api/usuarios`); a UI só esconde. A sessão demo é dono.
- Mudou o schema? Além do `schema.sql`/`seed.sql`, crie um arquivo numerado em `supabase/migrations/` para quem já está em produção.

## Variáveis de ambiente

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — produção; sem elas (ou com `NEXT_PUBLIC_DEMO=1`) o app roda em demo.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; usada só por `app/api/usuarios` (Config → Equipe). Nunca `NEXT_PUBLIC`.
- `ANTHROPIC_API_KEY` — server-only; ativa a IA da aba ✨ Assistente (`app/api/assistente`). Sem ela a aba usa o parser local `lib/assistenteLocal.ts`.
- `ANTHROPIC_MODEL` — opcional, default `claude-haiku-4-5`. Preços por modelo em `lib/precosIa.ts` — atualize lá se trocar.
- `IA_LIMITE_MENSAL_USD` — teto mensal do assistente em US$ (default 5). Cada resposta da API grava tokens+custo na tabela `uso_ia` (insert só via service role; equipe lê). Ao atingir o limite, `/api/assistente` responde no chat sem chamar a API; entre 80% e 100% anexa aviso de consumo. Card "Uso da IA" na Config (dono).

## Segurança das rotas /api

Sempre exigir o access token Supabase do usuário (`Authorization: Bearer`) e criar o client com esse token para as policies (RLS) valerem; `/api/usuarios` ainda confirma `papel='dono'` na tabela `perfil` no servidor antes de usar a service role key.
