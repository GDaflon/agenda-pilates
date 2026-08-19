-- ============================================================
-- 007 — Capacidade padrão das unidades passa de 5 para 6
--
-- A capacidade específica por horário (grade_horario.capacidade)
-- continua prevalecendo sobre o padrão da unidade — esta migration
-- NÃO toca em grade_horario, então os ajustes finos já feitos
-- (ex.: 7 vagas às 11:30 de segunda no unidade) ficam de pé.
-- ============================================================

alter table unidade alter column capacidade_padrao set default 6;

update unidade set capacidade_padrao = 6 where capacidade_padrao = 5;
