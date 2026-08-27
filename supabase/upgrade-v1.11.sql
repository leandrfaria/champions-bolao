-- ============================================================
-- CHAMPIONS BOLÃO — UPGRADE v1.11
-- Execute uma vez se o banco já está na v1.9/v1.10.
-- Adiciona logs de exclusão e limpeza administrativa do feed.
-- ============================================================

create or replace function public.log_round_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'round_deleted',
    'round',
    old.id,
    jsonb_build_object(
      'round_id', old.id,
      'round_name', old.name,
      'stage', old.stage,
      'season_id', old.season_id
    )
  );
  return old;
end;
$$;

drop trigger if exists log_round_before_delete on public.rounds;
create trigger log_round_before_delete
  before delete on public.rounds
  for each row execute function public.log_round_deleted();

create or replace function public.log_season_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'season_deleted',
    'season',
    old.id,
    jsonb_build_object(
      'season_id', old.id,
      'season_name', old.name
    )
  );
  return old;
end;
$$;

drop trigger if exists log_season_before_delete on public.seasons;
create trigger log_season_before_delete
  before delete on public.seasons
  for each row execute function public.log_season_deleted();

create or replace function public.clear_activity_feed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem limpar as atividades.';
  end if;

  delete from public.audit_logs;

  -- Marcador interno. A interface não o exibe; ele impede que eventos
  -- derivados de datas históricas reapareçam logo após a limpeza.
  insert into public.audit_logs (actor_user_id, action, entity_type, metadata)
  values (
    auth.uid(),
    'activity_feed_cleared',
    'activity',
    jsonb_build_object('cleared_at', now())
  );
end;
$$;

revoke execute on function public.log_round_deleted() from public, anon, authenticated, service_role;
revoke execute on function public.log_season_deleted() from public, anon, authenticated, service_role;
revoke execute on function public.clear_activity_feed() from public, anon, authenticated, service_role;
grant execute on function public.clear_activity_feed() to authenticated;

-- Enrich future activity logs with round_id so the round filter remains
-- reliable even when names are repeated between seasons.
create or replace function public.log_prediction_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  match_label text;
  round_label text;
  round_identifier uuid;
  action_name text;
begin
  if tg_op = 'UPDATE' and new.home_score = old.home_score and new.away_score = old.away_score then
    return new;
  end if;

  select m.home_team || ' x ' || m.away_team, r.name, r.id
  into match_label, round_label, round_identifier
  from public.matches m
  join public.rounds r on r.id = m.round_id
  where m.id = new.match_id;

  action_name := case when tg_op = 'INSERT' then 'prediction_created' else 'prediction_updated' end;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.user_id,
    action_name,
    'prediction',
    new.id,
    jsonb_build_object('match_name', match_label, 'round_name', round_label, 'round_id', round_identifier)
  );

  return new;
end;
$$;

create or replace function public.log_match_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  round_label text;
  round_identifier uuid;
  match_label text;
begin
  select name, id into round_label, round_identifier from public.rounds where id = new.round_id;
  match_label := new.home_team || ' x ' || new.away_team;

  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'match_created', 'match', new.id, jsonb_build_object('match_name', match_label, 'round_name', round_label, 'round_id', round_identifier));
  elsif new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score then
    if new.home_score is not null and new.away_score is not null then
      insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      values (
        auth.uid(),
        'result_updated',
        'match',
        new.id,
        jsonb_build_object(
          'match_name', match_label,
          'round_name', round_label,
          'round_id', round_identifier,
          'result', new.home_score::text || ' x ' || new.away_score::text
        )
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.log_prediction_activity() from public, anon, authenticated, service_role;
revoke execute on function public.log_match_activity() from public, anon, authenticated, service_role;

create or replace function public.log_round_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'round_created',
    'round',
    new.id,
    jsonb_build_object('round_id', new.id, 'round_name', new.name, 'stage', new.stage, 'season_id', new.season_id)
  );
  return new;
end;
$$;

revoke execute on function public.log_round_created() from public, anon, authenticated, service_role;
