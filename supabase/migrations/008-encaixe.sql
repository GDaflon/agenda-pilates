-- ============================================================
-- 008 — Encaixe: paciente a mais num horário específico
--
-- Marcar acima da capacidade passa a ser possível, mas só por decisão
-- explícita (p_encaixe = true) e fica gravado na reserva para a agenda
-- poder evidenciar ("7/6" + tag no chip).
--
-- O índice reserva_unica continua valendo: encaixe não permite a mesma
-- pessoa duas vezes no mesmo horário.
-- ============================================================

begin;

alter table reserva add column if not exists encaixe boolean not null default false;

-- vagas nunca ficam negativas: um horário com encaixe é "completo", não "-1 vaga"
create or replace function vagas_do_dia(p_unidade uuid, p_data date)
returns table (hora time, capacidade int, ocupadas bigint, livres int)
language sql stable set search_path = public as $$
  select gh.hora,
         coalesce(gh.capacidade, u.capacidade_padrao) as capacidade,
         (select count(*) from reserva r
           where r.unidade_id = gh.unidade_id and r.data = p_data
             and r.hora = gh.hora and r.status <> 'cancelado') as ocupadas,
         greatest(0,
           coalesce(gh.capacidade, u.capacidade_padrao)
             - (select count(*) from reserva r
                 where r.unidade_id = gh.unidade_id and r.data = p_data
                   and r.hora = gh.hora and r.status <> 'cancelado')::int) as livres
  from grade_horario gh
  join unidade u on u.id = gh.unidade_id
  where gh.unidade_id = p_unidade
    and gh.dia_semana = extract(dow from p_data)
    and gh.ativo
  order by gh.hora;
$$;

-- a assinatura antiga precisa sair: só acrescentar o parâmetro criaria uma
-- sobrecarga e a chamada com 5 argumentos ficaria ambígua
drop function if exists marcar_reserva(uuid, date, time, uuid, origem_reserva);

-- Marca um aluno checando capacidade (RN01). Erros: horario_inexistente | sem_vaga
-- p_encaixe = true pula a checagem de capacidade e grava encaixe = true.
create or replace function marcar_reserva(
  p_unidade uuid, p_data date, p_hora time, p_aluno uuid,
  p_origem origem_reserva default 'manual', p_encaixe boolean default false)
returns uuid language plpgsql set search_path = public as $$
declare
  v_cap  int;
  v_occ  int;
  v_tipo tipo_aluno;
  v_id   uuid;
begin
  select coalesce(gh.capacidade, u.capacidade_padrao) into v_cap
  from grade_horario gh join unidade u on u.id = gh.unidade_id
  where gh.unidade_id = p_unidade and gh.dia_semana = extract(dow from p_data)
    and gh.hora = p_hora and gh.ativo;
  if v_cap is null then raise exception 'horario_inexistente'; end if;

  if not p_encaixe then
    select count(*) into v_occ from reserva
    where unidade_id = p_unidade and data = p_data and hora = p_hora and status <> 'cancelado';
    if v_occ >= v_cap then raise exception 'sem_vaga'; end if;
  end if;

  select tipo into v_tipo from aluno where id = p_aluno;
  if v_tipo is null then raise exception 'aluno_inexistente'; end if;

  insert into reserva (unidade_id, data, hora, aluno_id, tipo_no_dia, origem, criado_por, encaixe)
  values (p_unidade, p_data, p_hora, p_aluno, v_tipo, p_origem, auth.uid(), p_encaixe)
  returning id into v_id;
  return v_id;
end $$;

commit;
