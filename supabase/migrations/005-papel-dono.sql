-- ============================================================
-- Migração 005 — Papel 'admin' vira 'dono'
--
-- Renomeia o papel em todo o banco: valores existentes, check
-- constraint da perfil e a função is_admin() → is_dono() (com as
-- policies que a usavam). O app passa a mostrar "Dono(a) do
-- estúdio" e só donos veem a aba Config.
--
-- Rode uma única vez no SQL Editor do Supabase.
-- ============================================================

alter table perfil drop constraint if exists perfil_papel_check;
update perfil set papel = 'dono' where papel = 'admin';
alter table perfil add constraint perfil_papel_check
  check (papel in ('dono', 'professora'));

create or replace function is_dono()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from perfil where id = auth.uid() and papel = 'dono');
$$;

-- policies de estrutura passam a usar is_dono()
drop policy if exists unidade_write on unidade;
create policy unidade_write on unidade
  for all to authenticated using (is_dono()) with check (is_dono());

drop policy if exists grade_write on grade_horario;
create policy grade_write on grade_horario
  for all to authenticated using (is_dono()) with check (is_dono());

drop function if exists is_admin();
