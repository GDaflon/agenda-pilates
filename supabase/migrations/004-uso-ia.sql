-- ============================================================
-- Migração 004 — Registro de uso da IA (aba ✨ Assistente)
--
-- Cada resposta da Claude API grava uma linha aqui com os tokens
-- e o custo calculado (lib/precosIa.ts). A rota /api/assistente
-- soma o mês corrente e respeita o limite IA_LIMITE_MENSAL_USD.
--
-- RLS: a equipe pode LER (card "Uso da IA" na Config); INSERT só
-- acontece pela service role (nenhuma policy de escrita para
-- authenticated — a service role ignora RLS).
--
-- Rode uma única vez no SQL Editor do Supabase.
-- ============================================================

create table if not exists uso_ia (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),
  usuario_id     uuid references perfil(id) on delete set null,
  modelo         text not null,
  tokens_entrada int not null default 0,
  tokens_saida   int not null default 0,
  custo_usd      numeric(10, 6) not null default 0
);

create index if not exists uso_ia_criado_em on uso_ia (criado_em);

alter table uso_ia enable row level security;

drop policy if exists uso_ia_select on uso_ia;
create policy uso_ia_select on uso_ia for select to authenticated using (is_team());
-- sem policy de insert/update/delete: escrita apenas via service role
