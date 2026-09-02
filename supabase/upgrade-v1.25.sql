-- CHAMPIONS BOLÃO v1.25 — exclusão segura de participantes pelo Admin
-- Execute uma vez no SQL Editor do Supabase.

create or replace function public.delete_participant(p_user_id uuid)
returns table (
  deleted_display_name text,
  deleted_avatar_path text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_display_name text;
  v_avatar_path text;
  v_role text;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Apenas administradores podem excluir participantes.';
  end if;

  if p_user_id is null then
    raise exception 'Participante inválido.';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'Você não pode excluir o próprio usuário enquanto está logado.';
  end if;

  select display_name, avatar_path, role
    into v_display_name, v_avatar_path, v_role
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Participante não encontrado.';
  end if;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor_id,
    'participant_deleted',
    'profile',
    p_user_id,
    jsonb_build_object(
      'display_name', v_display_name,
      'role', v_role,
      'deleted_user_id', p_user_id
    )
  );

  -- auth.users is the source of truth. Deleting it cascades to public.profiles;
  -- predictions are removed by their FK cascade, while matches.selected_by_user_id
  -- becomes NULL through ON DELETE SET NULL.
  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'Não foi possível excluir o usuário da autenticação.';
  end if;

  return query select v_display_name, v_avatar_path;
end;
$$;

revoke execute on function public.delete_participant(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_participant(uuid) to authenticated;
