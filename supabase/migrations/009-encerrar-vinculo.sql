-- ============================================================
-- 009 — encerrar_vinculo: encerra um horário fixo pelo id do vínculo
--
-- O encerrar_fixo existente parte de uma RESERVA (é o fluxo da agenda,
-- pelo ReservaSheet). A ficha do aluno não tem reserva em mãos: ela lista
-- vinculo_fixo direto, então precisa encerrar pelo id do vínculo.
--
-- Diferente do encerrar_fixo, aqui as reservas FUTURAS já materializadas
-- também são canceladas — senão a pessoa continuaria aparecendo nos dias
-- que já tinham sido abertos na agenda.
-- Reservas com check-in/falta ficam intactas: são histórico.
-- ============================================================

begin;

create or replace function encerrar_vinculo(p_vinculo uuid)
returns void language plpgsql set search_path = public as $$
declare
  v_unidade uuid;
  v_hora    time;
  v_dow     int;
  v_aluno   uuid;
begin
  select gh.unidade_id, gh.hora, gh.dia_semana, vf.aluno_id
    into v_unidade, v_hora, v_dow, v_aluno
    from vinculo_fixo vf
    join grade_horario gh on gh.id = vf.grade_horario_id
   where vf.id = p_vinculo;
  if v_unidade is null then raise exception 'vinculo_inexistente'; end if;

  -- o vínculo deixa de valer a partir de hoje
  update vinculo_fixo set fim = current_date - 1 where id = p_vinculo;

  -- solta as vagas futuras que o gerar_dia já tinha materializado
  update reserva
     set status = 'cancelado', cancelado_em = now()
   where unidade_id = v_unidade
     and aluno_id   = v_aluno
     and hora       = v_hora
     and data      >= current_date
     and origem     = 'fixo'
     and status     = 'reservado'
     and extract(dow from data) = v_dow;
end $$;

commit;
