-- CHAMPIONS BOLÃO — SECURITY HARDENING v1.2
-- Use this if your database already ran setup.sql from v1.1.
-- It is safe to run setup.sql v1.2 in full instead; this file is the smaller security-only patch.

-- Existing application tables: no unauthenticated/public Data API access.
revoke all on public.profiles, public.seasons, public.rounds, public.matches, public.predictions, public.audit_logs from public;
revoke all on public.profiles, public.seasons, public.rounds, public.matches, public.predictions, public.audit_logs from anon;

-- Reassert the minimum grants needed by signed-in users.
revoke all on public.profiles, public.seasons, public.rounds, public.matches, public.predictions, public.audit_logs from authenticated;
grant select on public.profiles to authenticated;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path'
  ) then
    execute 'grant update (avatar_path) on public.profiles to authenticated';
  end if;
end $$;
grant select, insert, update, delete on public.seasons to authenticated;
grant select, insert, update, delete on public.rounds to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.predictions to authenticated;
grant select on public.audit_logs to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;

-- Defense-in-depth: the pre-kickoff presence RPC must never answer an unauthenticated request.
create or replace function public.get_prediction_presence(p_match_ids uuid[])
returns table (
  match_id uuid,
  user_id uuid,
  display_name text,
  has_predicted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id as match_id,
    p.id as user_id,
    p.display_name,
    exists (
      select 1 from public.predictions pr
      where pr.match_id = m.id and pr.user_id = p.id
    ) as has_predicted
  from public.matches m
  cross join public.profiles p
  where auth.uid() is not null
    and m.id = any(p_match_ids)
  order by m.kickoff_at, p.display_name;
$$;

-- Explicitly remove automatic/default function execution from every client role.
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.is_admin() from public, anon, authenticated, service_role;
revoke execute on function public.match_has_started(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.match_is_open(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.guard_prediction_write() from public, anon, authenticated, service_role;
revoke execute on function public.guard_match_result() from public, anon, authenticated, service_role;
revoke execute on function public.log_prediction_activity() from public, anon, authenticated, service_role;
revoke execute on function public.log_round_created() from public, anon, authenticated, service_role;
revoke execute on function public.log_season_created() from public, anon, authenticated, service_role;
revoke execute on function public.log_match_activity() from public, anon, authenticated, service_role;
revoke execute on function public.record_login_activity() from public, anon, authenticated, service_role;
revoke execute on function public.get_prediction_presence(uuid[]) from public, anon, authenticated, service_role;
revoke execute on function public.set_active_season(uuid) from public, anon, authenticated, service_role;

-- Only signed-in app users may call these helpers/RPCs.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.match_has_started(uuid) to authenticated;
grant execute on function public.match_is_open(uuid) to authenticated;
grant execute on function public.record_login_activity() to authenticated;
grant execute on function public.get_prediction_presence(uuid[]) to authenticated;
grant execute on function public.set_active_season(uuid) to authenticated;

-- Future objects in public become opt-in instead of automatically API-accessible.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
