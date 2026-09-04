-- CHAMPIONS BOLÃO v1.27 — correção da redefinição e acesso administrativo ao Sorteio

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

  -- O WHERE é proposital: ambientes com pg-safeupdate bloqueiam DELETE sem cláusula WHERE.
  delete from public.roulette_exclusions
  where user_id is not null;

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

-- Os participantes comuns não precisam consultar o estado interno da roleta.
-- O resultado público continua aparecendo nas atividades através de audit_logs.
drop policy if exists roulette_draws_select_authenticated on public.roulette_draws;
drop policy if exists roulette_exclusions_select_authenticated on public.roulette_exclusions;
drop policy if exists roulette_draws_select_admin on public.roulette_draws;
drop policy if exists roulette_exclusions_select_admin on public.roulette_exclusions;

create policy roulette_draws_select_admin
  on public.roulette_draws for select
  to authenticated
  using (public.is_admin());

create policy roulette_exclusions_select_admin
  on public.roulette_exclusions for select
  to authenticated
  using (public.is_admin());

revoke execute on function public.reset_round_roulette() from public, anon, authenticated, service_role;
grant execute on function public.reset_round_roulette() to authenticated;
