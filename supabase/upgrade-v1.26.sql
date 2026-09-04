-- CHAMPIONS BOLÃO v1.26 — Sorteio de responsáveis + Pódio histórico
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.roulette_draws (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  first_user_id uuid references public.profiles(id) on delete set null,
  first_display_name text not null,
  second_user_id uuid references public.profiles(id) on delete set null,
  second_display_name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_roulette_draws_round_created
  on public.roulette_draws(round_id, created_at desc);

create table if not exists public.roulette_exclusions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  excluded_at timestamptz not null default now(),
  excluded_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.podium_champions (
  id uuid primary key default gen_random_uuid(),
  season_label text not null,
  season_sort integer not null,
  winner_order integer not null default 1 check (winner_order > 0),
  winner_name text not null,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (season_label, winner_order, winner_name)
);

create index if not exists idx_podium_champions_season
  on public.podium_champions(season_sort desc, winner_order);

insert into public.podium_champions (season_label, season_sort, winner_order, winner_name)
values
  ('22/23', 2022, 1, 'Caio'),
  ('23/24', 2023, 1, 'João Pedro'),
  ('24/25', 2024, 1, 'Leandro'),
  ('24/25', 2024, 2, 'Matheus'),
  ('25/26', 2025, 1, 'Caio'),
  ('25/26', 2025, 2, 'João Pedro')
on conflict (season_label, winner_order, winner_name) do nothing;

-- Vincula automaticamente as fotos dos vencedores que também existem como
-- participantes atuais com o mesmo nome. Se não existir, a tela mantém o nome
-- e usa fallback de iniciais até que um perfil correspondente exista.
update public.podium_champions pc
set user_id = p.id
from public.profiles p
where pc.user_id is null
  and lower(trim(pc.winner_name)) = lower(trim(p.display_name));

create or replace function public.spin_round_roulette(p_round_id uuid)
returns table (
  draw_id uuid,
  round_id uuid,
  round_name text,
  first_user_id uuid,
  first_display_name text,
  first_avatar_path text,
  second_user_id uuid,
  second_display_name text,
  second_avatar_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_name text;
  v_first_id uuid;
  v_first_name text;
  v_first_avatar text;
  v_second_id uuid;
  v_second_name text;
  v_second_avatar text;
  v_draw_id uuid;
  v_created_at timestamptz;
  v_ids uuid[];
  v_names text[];
  v_avatars text[];
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem girar a roleta.';
  end if;

  select r.name into v_round_name
  from public.rounds r
  where r.id = p_round_id;

  if v_round_name is null then
    raise exception 'Rodada não encontrada.';
  end if;

  with candidates as (
    select p.id, p.display_name, p.avatar_path
    from public.profiles p
    where not exists (
      select 1
      from public.roulette_exclusions e
      where e.user_id = p.id
    )
    order by random()
    limit 2
  ), numbered as (
    select c.*, row_number() over () as rn
    from candidates c
  )
  select
    array_agg(id order by rn),
    array_agg(display_name order by rn),
    array_agg(avatar_path order by rn)
  into v_ids, v_names, v_avatars
  from numbered;

  v_first_id := v_ids[1];
  v_first_name := v_names[1];
  v_first_avatar := v_avatars[1];
  v_second_id := v_ids[2];
  v_second_name := v_names[2];
  v_second_avatar := v_avatars[2];

  if v_first_id is null or v_second_id is null then
    raise exception 'Não há dois participantes disponíveis. Redefina os participantes da roleta na Administração.';
  end if;

  insert into public.roulette_draws (
    round_id,
    first_user_id,
    first_display_name,
    second_user_id,
    second_display_name,
    created_by
  )
  values (
    p_round_id,
    v_first_id,
    v_first_name,
    v_second_id,
    v_second_name,
    auth.uid()
  )
  returning id, public.roulette_draws.created_at into v_draw_id, v_created_at;

  insert into public.roulette_exclusions (user_id, excluded_by)
  values
    (v_first_id, auth.uid()),
    (v_second_id, auth.uid())
  on conflict (user_id) do nothing;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'roulette_spun',
    'round',
    p_round_id,
    jsonb_build_object(
      'round_id', p_round_id,
      'round_name', v_round_name,
      'selected_user_ids', jsonb_build_array(v_first_id, v_second_id),
      'selected_names', jsonb_build_array(v_first_name, v_second_name)
    )
  );

  return query
  select
    v_draw_id,
    p_round_id,
    v_round_name,
    v_first_id,
    v_first_name,
    v_first_avatar,
    v_second_id,
    v_second_name,
    v_second_avatar,
    v_created_at;
end;
$$;

create or replace function public.reset_round_roulette()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removed integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem redefinir a roleta.';
  end if;

  delete from public.roulette_exclusions;
  get diagnostics v_removed = row_count;

  insert into public.audit_logs (actor_user_id, action, entity_type, metadata)
  values (
    auth.uid(),
    'roulette_reset',
    'roulette',
    jsonb_build_object('removed_participants', v_removed)
  );

  return v_removed;
end;
$$;

alter table public.roulette_draws enable row level security;
alter table public.roulette_exclusions enable row level security;
alter table public.podium_champions enable row level security;

drop policy if exists roulette_draws_select_authenticated on public.roulette_draws;
drop policy if exists roulette_exclusions_select_authenticated on public.roulette_exclusions;
drop policy if exists podium_champions_select_authenticated on public.podium_champions;

create policy roulette_draws_select_authenticated
  on public.roulette_draws for select
  to authenticated
  using (true);

create policy roulette_exclusions_select_authenticated
  on public.roulette_exclusions for select
  to authenticated
  using (true);

create policy podium_champions_select_authenticated
  on public.podium_champions for select
  to authenticated
  using (true);

revoke all on public.roulette_draws, public.roulette_exclusions, public.podium_champions from public, anon, authenticated;
grant select on public.roulette_draws, public.roulette_exclusions, public.podium_champions to authenticated;

revoke execute on function public.spin_round_roulette(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.reset_round_roulette() from public, anon, authenticated, service_role;
grant execute on function public.spin_round_roulette(uuid) to authenticated;
grant execute on function public.reset_round_roulette() to authenticated;
