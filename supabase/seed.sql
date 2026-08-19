-- ============================================================
-- Agenda Pilates — Seed inicial
-- Rode DEPOIS do schema.sql. Ajuste os nomes das unidades!
-- ============================================================

-- unidades do Natty Estúdio Pilates
insert into unidade (nome, capacidade_padrao) values
  ('Centro', 6),
  ('Jardim', 6);

-- Grade padrão (turmas nas meias horas): seg–sex 05:30–11:30 e 15:30–19:30,
-- sáb 08:30–11:30, para todas as unidades.
-- (Depois é só ajustar na tela Config do app, que é admin-only.)
insert into grade_horario (unidade_id, dia_semana, hora)
select u.id, d.dia, make_time(h.hora, 30, 0)
from unidade u
cross join (values (1),(2),(3),(4),(5)) as d(dia)
cross join (values (5),(6),(7),(8),(9),(10),(11),(15),(16),(17),(18),(19)) as h(hora)
on conflict (unidade_id, dia_semana, hora) do nothing;

insert into grade_horario (unidade_id, dia_semana, hora)
select u.id, 6, make_time(h.hora, 30, 0)
from unidade u
cross join (values (8),(9),(10),(11)) as h(hora)
on conflict (unidade_id, dia_semana, hora) do nothing;

-- ============================================================
-- DEPOIS de criar seu usuário em Authentication → Users,
-- promova-o a admin (troque o e-mail):
--
-- update perfil set papel = 'admin', nome = 'Seu Nome'
--  where id = (select id from auth.users where email = 'voce@exemplo.com');
-- ============================================================
