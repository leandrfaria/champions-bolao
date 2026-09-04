-- CHAMPIONS BOLÃO v1.28 — limpar atividades com pg-safeupdate

create or replace function public.clear_activity_feed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem limpar as atividades.';
  end if;

  -- O WHERE é intencional: projetos com pg-safeupdate rejeitam DELETE sem WHERE.
  delete from public.audit_logs
  where id is not null;

  -- Marcador interno usado pela interface para impedir que eventos derivados
  -- de datas históricas reapareçam logo após a limpeza.
  insert into public.audit_logs (actor_user_id, action, entity_type, metadata)
  values (
    auth.uid(),
    'activity_feed_cleared',
    'activity',
    jsonb_build_object('cleared_at', now())
  );
end;
$$;

revoke execute on function public.clear_activity_feed() from public, anon, authenticated, service_role;
grant execute on function public.clear_activity_feed() to authenticated;
