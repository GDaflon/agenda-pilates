# Agenda Pilates 🧘‍♀️

Agenda digital para as 3 clínicas de pilates — substitui a agenda de papel e o vai-e-vem do WhatsApp.

**Fase 1 (este repositório):** agenda do dia por unidade, marcação em 2 toques com autocomplete (cadastro de aluno nasce sozinho), horário fixo semanal para qualquer aluno (mensalista, Wellhub ou TotalPass), ausência que libera vaga só no dia, check-in/falta, geração da mensagem de vagas para o grupo do WhatsApp, atualização em tempo real entre celulares, PWA (instala como app).

Stack: **Next.js 16 (App Router) + Supabase (Postgres, Auth, Realtime) + Vercel**. Custo: R$ 0/mês nos planos free.

---

## Rodar agora (modo demonstração)

Sem configurar nada — dados fictícios em memória:

```bash
npm install
npm run dev
# abra http://localhost:3000
```

O arquivo `.env.local` com `NEXT_PUBLIC_DEMO=1` já força o modo demo. É o mesmo visual e fluxo da produção.

---

## Colocar em produção (~20 minutos)

### 1. Criar o projeto no Supabase

1. [supabase.com](https://supabase.com) → **New project** (plano Free) → região `South America (São Paulo)`.
2. **SQL Editor** → cole e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) (uma vez).
3. Ainda no SQL Editor → rode [`supabase/seed.sql`](supabase/seed.sql) — **antes, ajuste os nomes das 3 unidades** no arquivo.

### 2. Criar o primeiro usuário (dono)

1. **Authentication → Users → Add user** → seu e-mail + senha. Marque *Auto Confirm User*.
2. Todo usuário novo entra como `professora`. Promova você a dono(a) no SQL Editor:

```sql
update perfil set papel = 'dono', nome = 'Nome da Mãe'
 where id = (select id from auth.users where email = 'email-dela@exemplo.com');
```

3. As **professoras** você cria pelo próprio app: **Config → Equipe** (só dono) — nome, e-mail, senha temporária e papel. Lá também dá para trocar papel e desativar o acesso. (Precisa da `SUPABASE_SERVICE_ROLE_KEY` no passo 3.)

> Já rodou o schema antigo? Rode também os arquivos de [`supabase/migrations/`](supabase/migrations/) na ordem (002 = grade nas meias horas, 003 = coluna `ativo` do perfil, 004 = tabela `uso_ia`, 005 = papel admin→dono).

### 3. Variáveis de ambiente

**Project Settings → API** → copie `URL`, `anon public key` e `service_role key`. Crie `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# server-only (NUNCA exponha com NEXT_PUBLIC): usada por /api/usuarios (Config → Equipe)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# assistente de IA (aba ✨ Assistente) — server-only
ANTHROPIC_API_KEY=sk-ant-...
# opcional; padrão: claude-haiku-4-5 (rápido/barato)
ANTHROPIC_MODEL=claude-haiku-4-5
# teto mensal de gasto com a IA em US$ (padrão 5) — ao atingir, o chat pausa
IA_LIMITE_MENSAL_USD=5
```

(O arquivo [`.env.example`](.env.example) tem o modelo completo.) Cada resposta da IA grava tokens
e custo na tabela `uso_ia`; o card **Config → Uso da IA** (só dono) mostra o consumo do mês com
barra de progresso, e o assistente pausa sozinho ao atingir o limite.

Sem `ANTHROPIC_API_KEY` o app continua funcionando — a aba Assistente cai num parser local simples e avisa na tela. (Remova/comente o `NEXT_PUBLIC_DEMO=1`.) Rode `npm run dev` e faça login — pronto, dados reais.

### 4. Publicar na Vercel

1. Suba o código para o GitHub (abaixo).
2. [vercel.com](https://vercel.com) → **Add New → Project** → importe `GDaflon/agenda-pilates`.
3. Em **Environment Variables**, adicione as variáveis do passo 3 (incluindo `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` e, se quiser, `ANTHROPIC_MODEL`). Deploy.
4. Opcional: domínio próprio (ex.: `agenda.suaclinica.com.br`).

### 5. Instalar como app no celular da equipe

Abra o site no celular → menu do navegador → **Adicionar à tela inicial**. Vira um ícone com cara de app (PWA).

---

## Publicar no GitHub

O repositório já existe: `GDaflon/agenda-pilates`. Na sua máquina:

```bash
git remote add origin git@github.com:GDaflon/agenda-pilates.git
git push -u origin main
```

---

## Estrutura

```
app/
  (app)/            telas autenticadas (shell com header + nav)
    page.tsx        Agenda do dia (marcar, check-in, falta, ausência)
    mes/            Visão mensal
    vagas/          Mensagem de vagas p/ WhatsApp (copiar com 1 toque)
    assistente/     ✨ Assistente (chat com IA: marcar/desmarcar/vagas por texto ou voz)
    alunos/         Lista/cadastro/edição de alunos
    config/         Só dono: unidades, grade semanal, equipe, uso da IA
  api/
    assistente/     POST: Claude API com tool use sobre as funções SQL da agenda
    usuarios/       POST: dono cria/gerencia usuários (service role key)
  login/            Login e-mail/senha (ou entrada demo)
components/         Sheets de marcação/reserva/aluno, shell, badges
lib/
  repo.ts           Interface única de dados (AgendaRepo)
  demoRepo.ts       Implementação em memória (modo demonstração)
  supabaseRepo.ts   Implementação real (RPC + RLS + Realtime)
  mensagem.ts       Gerador da mensagem de vagas (lotados saem tachados)
  assistenteLocal.ts Parser local de fallback do assistente (sem ANTHROPIC_API_KEY)
supabase/
  schema.sql        Tabelas, RLS, funções (gerar_dia, marcar_reserva, …)
  seed.sql          Unidades + grade padrão (turmas nas meias horas)
  migrations/       Para quem rodou versões antigas do schema/seed
```

> Convenção de horário no código: `hora` é sempre **minutos do dia** (330 = 05:30);
> exibição "05h30". No banco continua o tipo `time` — a conversão vive em `lib/dates.ts`.

### Regras que o banco garante (não confie só na tela)

- Capacidade por turma (função `marcar_reserva` → erro `sem_vaga`).
- Sem marcação duplicada ativa (índice único `reserva_unica`).
- Fixos materializados por dia pela função idempotente `gerar_dia`.
- Ausência de fixo (`registrar_ausencia`) libera a vaga **só naquele dia**.
- RLS: só usuários com `perfil` acessam; estrutura (unidades/grade) só dono.

---

## Roadmap

- **Fase 2** — ficha completa do aluno, histórico de presença, relatório mensal de check-ins Wellhub/TotalPass (conferência de repasse), ocupação por horário.
- **Fase 3** — portal do aluno Wellhub/TotalPass: reserva self-service com regras (janela, limite/dia, prazo de desmarcação, anti no-show). A base (RLS, telefone no cadastro) já está pronta.
- **Fase 4** — ~~assistente de texto (Claude API com tool use sobre `marcar_reserva`/`registrar_ausencia`/vagas)~~ **feito** (aba ✨ Assistente) · lembretes 1:1 via WhatsApp API oficial. A mensagem no grupo grande segue manual — a API oficial não atende grupos de comunidade (limite de 8 participantes).

A especificação completa (regras de negócio numeradas, fases, decisões) está no projeto **Clinica** do Claude.
