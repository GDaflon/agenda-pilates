-- ============================================================
-- Migração 006 — Troca de senha obrigatória no primeiro acesso
--
-- Usuárias criadas pelo card Equipe entram com senha temporária;
-- a flag abaixo força a troca na primeira entrada (/trocar-senha).
-- A própria usuária zera a flag após trocar (policy perfil_update
-- de self-update já cobre).
--
-- Rode uma única vez no SQL Editor do Supabase.
-- ============================================================

alter table perfil add column if not exists precisa_trocar_senha boolean not null default false;
