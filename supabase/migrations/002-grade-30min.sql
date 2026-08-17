-- ============================================================
-- Migração 002 — Grade em meias horas (05:30, 06:30, …)
--
-- Para quem já rodou o seed antigo (turmas em hora cheia).
-- O que ela faz:
--   1. DESATIVA os horários antigos de hora cheia da grade
--      (ativo = false) — nada é apagado, então as reservas já
--      feitas nesses horários continuam intactas no histórico.
--   2. Cria a nova grade padrão nas meias horas:
--      seg–sex 05:30–11:30 e 15:30–19:30, sáb 08:30–11:30.
--
-- ATENÇÃO:
--   • Reservas existentes NÃO são tocadas.
--   • Vínculos fixos apontando para horários antigos param de
--     gerar reserva (o horário fica inativo). Remarque os fixos
--     nos novos horários pela tela de agenda.
--   • Rode uma única vez no SQL Editor do Supabase.
-- ============================================================

-- 1) desativa a grade antiga de hora cheia (minuto = 0)
update grade_horario
   set ativo = false
 where extract(minute from hora) = 0;

-- 2) nova grade padrão nas meias horas, em todas as unidades ativas
insert into grade_horario (unidade_id, dia_semana, hora)
select u.id, d.dia, make_time(h.hora, 30, 0)
from unidade u
cross join (values (1),(2),(3),(4),(5)) as d(dia)
cross join (values (5),(6),(7),(8),(9),(10),(11),(15),(16),(17),(18),(19)) as h(hora)
where u.ativo
on conflict (unidade_id, dia_semana, hora) do update set ativo = true;

insert into grade_horario (unidade_id, dia_semana, hora)
select u.id, 6, make_time(h.hora, 30, 0)
from unidade u
cross join (values (8),(9),(10),(11)) as h(hora)
where u.ativo
on conflict (unidade_id, dia_semana, hora) do update set ativo = true;
