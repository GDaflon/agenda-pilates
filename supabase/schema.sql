-- ============================================================
-- Agenda Pilates — Schema Fase 1 (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- Depois rode o seed.sql.
-- ============================================================

-- ---------- Tipos ----------
do $$ begin
  create type tipo_aluno as enum ('mensalista','wellhub','totalpass');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_reserva as enum ('reservado','checkin','falta','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_reserva as enum ('fixo','manual','portal','assistente');
exception when duplicate_object then null; end $$;

-- ---------- Tabelas ----------
create table if not exists unidade (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  capacidade_padrao int  not null default 6,
  ativo             boolean not null default true
);

-- professoras/dono; espelha auth.users
create table if not exists perfil (
  id                   uuid primary key references auth.users(id) on delete cascade,
  nome                 text not null,
  papel                text not null default 'professora' check (papel in ('dono','professora')),
  ativo                boolean not null default true,
  precisa_trocar_senha boolean not null default false,
  criado_em            timestamptz not null default now()
);

create table if not exists aluno (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  telefone    text,
  tipo        tipo_aluno not null,
  observacoes text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- grade semanal de turmas ofertadas por unidade (0 = domingo)
create table if not exists grade_horario (
  id         uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidade(id) on delete cascade,
  dia_semana int  not null check (dia_semana between 0 and 6),
  hora       time not null,
  capacidade int,
  ativo      boolean not null default true,
  unique (unidade_id, dia_semana, hora)
);

-- aluno "dono" de uma vaga recorrente (qualquer tipo: mensalista, wellhub, totalpass)
create table if not exists vinculo_fixo (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references aluno(id) on delete cascade,
  grade_horario_id uuid not null references grade_horario(id) on delete cascade,
  inicio           date not null default current_date,
  fim              date
);

-- uma pessoa em um horário de um dia específico
create table if not exists reserva (
  id           uuid primary key default gen_random_uuid(),
  unidade_id   uuid not null references unidade(id) on delete cascade,
  data         date not null,
  hora         time not null,
  aluno_id     uuid not null references aluno(id) on delete cascade,
  tipo_no_dia  tipo_aluno not null,
  origem       origem_reserva not null default 'manual',
  status       status_reserva not null default 'reservado',
  encaixe      boolean not null default false,
  criado_por   uuid references perfil(id),
  criado_em    timestamptz not null default now(),
  cancelado_em timestamptz
);

-- RN11: sem duplicidade ativa no mesmo horário
create unique index if not exists reserva_unica
  on reserva (unidade_id, data, hora, aluno_id)
  where status <> 'cancelado';

create index if not exists reserva_dia on reserva (unidade_id, data);

-- aluno com fixo avisou que falta em uma data (libera a vaga só naquele dia)
create table if not exists ausencia_fixo (
  id              uuid primary key default gen_random_uuid(),
  vinculo_fixo_id uuid not null references vinculo_fixo(id) on delete cascade,
  data            date not null,
  motivo          text,
  criado_em       timestamptz not null default now(),
  unique (vinculo_fixo_id, data)
);

-- registro de uso da IA (aba Assistente); escrita só via service role
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

-- ---------- Perfil automático no signup ----------
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfil (id, nome, papel)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          'professora')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Helpers de permissão ----------
create or replace function is_team()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from perfil where id = auth.uid());
$$;

create or replace function is_dono()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from perfil where id = auth.uid() and papel = 'dono');
$$;

-- ---------- RLS ----------
alter table unidade       enable row level security;
alter table perfil        enable row level security;
alter table aluno         enable row level security;
alter table grade_horario enable row level security;
alter table vinculo_fixo  enable row level security;
alter table reserva       enable row level security;
alter table ausencia_fixo enable row level security;
alter table uso_ia        enable row level security;

-- equipe lê tudo; escrita operacional para equipe; estrutura só dono
drop policy if exists unidade_select on unidade;
create policy unidade_select on unidade for select to authenticated using (is_team());
drop policy if exists unidade_write on unidade;
create policy unidade_write on unidade for all to authenticated using (is_dono()) with check (is_dono());

drop policy if exists perfil_select on perfil;
create policy perfil_select on perfil for select to authenticated using (is_team());
drop policy if exists perfil_update on perfil;
create policy perfil_update on perfil for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists grade_select on grade_horario;
create policy grade_select on grade_horario for select to authenticated using (is_team());
drop policy if exists grade_write on grade_horario;
create policy grade_write on grade_horario for all to authenticated using (is_dono()) with check (is_dono());

drop policy if exists aluno_all on aluno;
create policy aluno_all on aluno for all to authenticated using (is_team()) with check (is_team());

drop policy if exists vinculo_all on vinculo_fixo;
create policy vinculo_all on vinculo_fixo for all to authenticated using (is_team()) with check (is_team());

drop policy if exists reserva_all on reserva;
create policy reserva_all on reserva for all to authenticated using (is_team()) with check (is_team());

drop policy if exists ausencia_all on ausencia_fixo;
create policy ausencia_all on ausencia_fixo for all to authenticated using (is_team()) with check (is_team());

-- equipe lê o uso da IA; escrita só via service role (sem policy de insert)
drop policy if exists uso_ia_select on uso_ia;
create policy uso_ia_select on uso_ia for select to authenticated using (is_team());

-- ---------- Funções de negócio ----------

-- Materializa as reservas dos alunos fixos de um dia (idempotente).
-- Nunca recria reserva que já existe (mesmo cancelada) nem de quem avisou ausência.
create or replace function gerar_dia(p_unidade uuid, p_data date)
returns void language plpgsql set search_path = public as $$
begin
  insert into reserva (unidade_id, data, hora, aluno_id, tipo_no_dia, origem, status)
  select gh.unidade_id, p_data, gh.hora, vf.aluno_id, a.tipo, 'fixo', 'reservado'
  from vinculo_fixo vf
  join grade_horario gh on gh.id = vf.grade_horario_id
  join aluno a on a.id = vf.aluno_id
  where gh.unidade_id = p_unidade
    and gh.ativo
    and a.ativo
    and gh.dia_semana = extract(dow from p_data)
    and vf.inicio <= p_data
    and (vf.fim is null or vf.fim >= p_data)
    and not exists (
      select 1 from ausencia_fixo af
      where af.vinculo_fixo_id = vf.id and af.data = p_data)
    and not exists (
      select 1 from reserva r
      where r.unidade_id = gh.unidade_id and r.data = p_data
        and r.hora = gh.hora and r.aluno_id = vf.aluno_id);
end $$;

-- Vagas de um dia por horário
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

-- Marca um aluno checando capacidade (RN01). Erros: horario_inexistente | sem_vaga
-- p_encaixe = true pula a checagem de capacidade e grava encaixe = true
-- (paciente a mais por decisão explícita da equipe).
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

-- Cancela uma reserva; se for de fixo, registra a ausência do dia (RN03)
create or replace function registrar_ausencia(p_reserva uuid, p_motivo text default null)
returns void language plpgsql set search_path = public as $$
declare
  r reserva%rowtype;
  v_vinculo uuid;
begin
  select * into r from reserva where id = p_reserva;
  if r.id is null then raise exception 'reserva_inexistente'; end if;

  update reserva set status = 'cancelado', cancelado_em = now() where id = p_reserva;

  if r.origem = 'fixo' then
    select vf.id into v_vinculo
    from vinculo_fixo vf
    join grade_horario gh on gh.id = vf.grade_horario_id
    where vf.aluno_id = r.aluno_id
      and gh.unidade_id = r.unidade_id
      and gh.hora = r.hora
      and gh.dia_semana = extract(dow from r.data)
      and vf.inicio <= r.data and (vf.fim is null or vf.fim >= r.data)
    limit 1;
    if v_vinculo is not null then
      insert into ausencia_fixo (vinculo_fixo_id, data, motivo)
      values (v_vinculo, r.data, p_motivo)
      on conflict (vinculo_fixo_id, data) do nothing;
    end if;
  end if;
end $$;

-- Cria vínculo fixo semanal para o aluno (qualquer tipo) + reserva do dia escolhido.
-- Erros: horario_inexistente | ja_fixo | sem_vaga
create or replace function criar_fixo(p_unidade uuid, p_data date, p_hora time, p_aluno uuid)
returns void language plpgsql set search_path = public as $$
declare v_grade uuid;
begin
  select id into v_grade from grade_horario
  where unidade_id = p_unidade and dia_semana = extract(dow from p_data)
    and hora = p_hora and ativo;
  if v_grade is null then raise exception 'horario_inexistente'; end if;

  if exists (select 1 from vinculo_fixo vf
             where vf.grade_horario_id = v_grade and vf.aluno_id = p_aluno
               and vf.inicio <= p_data and (vf.fim is null or vf.fim >= p_data)) then
    raise exception 'ja_fixo';
  end if;

  insert into vinculo_fixo (aluno_id, grade_horario_id, inicio) values (p_aluno, v_grade, p_data);
  perform marcar_reserva(p_unidade, p_data, p_hora, p_aluno, 'fixo');
end $$;

-- Encerra o vínculo fixo a partir de uma reserva (fim = véspera) e cancela a reserva do dia
create or replace function encerrar_fixo(p_reserva uuid)
returns void language plpgsql set search_path = public as $$
declare r reserva%rowtype;
begin
  select * into r from reserva where id = p_reserva;
  if r.id is null then raise exception 'reserva_inexistente'; end if;

  update reserva set status = 'cancelado', cancelado_em = now() where id = p_reserva;

  update vinculo_fixo vf
     set fim = r.data - 1
    from grade_horario gh
   where gh.id = vf.grade_horario_id
     and vf.aluno_id = r.aluno_id
     and gh.unidade_id = r.unidade_id
     and gh.hora = r.hora
     and gh.dia_semana = extract(dow from r.data)
     and (vf.fim is null or vf.fim >= r.data);
end $$;

-- ---------- Realtime ----------
do $$ begin
  alter publication supabase_realtime add table reserva;
exception when duplicate_object then null; end $$;
