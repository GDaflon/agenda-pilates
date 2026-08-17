-- ============================================================
-- Migração 003 — Gestão de equipe pelo app
--
-- Adiciona a coluna `ativo` na tabela perfil, usada pelo card
-- "Equipe" da Config (admin cria professoras, troca papel e
-- desativa acesso). A desativação também aplica ban no auth
-- (feita pela rota /api/usuarios com a service role key).
--
-- Rode uma única vez no SQL Editor do Supabase.
-- ============================================================

alter table perfil add column if not exists ativo boolean not null default true;
