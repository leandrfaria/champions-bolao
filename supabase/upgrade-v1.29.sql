-- CHAMPIONS BOLÃO v1.29 — sorteio parcial e limite de dois participantes por rodada
-- Execute uma vez no SQL Editor do Supabase antes de publicar a nova tela.

alter table public.roulette_draws
  alter column second_display_name drop not null;

create or replace function public.spin_round_roulette(
  p_round_id uuid,
  p_participant_count integer
)
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
  v_slots_used integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem girar a roleta.';
  end if;
  if p_participant_count not between 1 and 2 then
    raise exception 'Escolha sortear 1 ou 2 participantes.';
  end if;

  -- Serializa giros globais para evitar selecionar o mesmo participante em sessões concorrentes.
  perform pg_advisory_xact_lock(719332001);

  select r.name into v_round_name
  from public.rounds r
  where r.id = p_round_id
  for update;
  if not found then
    raise exception 'Rodada não encontrada.';
  end if;

  select count(*) + count(d.second_display_name)
  into v_slots_used
  from public.roulette_draws d
  where d.round_id = p_round_id;

  if v_slots_used >= 2 then
    raise exception 'Esta rodada já está completa (2 de 2 participantes).';
  end if;
  if p_participant_count > 2 - v_slots_used then
    raise exception 'Só resta % vaga(s) para completar esta rodada.', 2 - v_slots_used;
  end if;

  with candidates as (
    select p.id, p.display_name, p.avatar_path, random() as draw_order
    from public.profiles p
    where not exists (
      select 1 from public.roulette_exclusions e where e.user_id = p.id
    )
    order by draw_order
    limit p_participant_count
  )
  select
    array_agg(c.id order by c.draw_order),
    array_agg(c.display_name order by c.draw_order),
    array_agg(c.avatar_path order by c.draw_order)
  into v_ids, v_names, v_avatars
  from candidates c;

  if coalesce(cardinality(v_ids), 0) < p_participant_count then
    raise exception 'Há apenas % participante(s) disponível(is); ajuste a quantidade do sorteio.', coalesce(cardinality(v_ids), 0);
  end if;

  v_first_id := v_ids[1];
  v_first_name := v_names[1];
  v_first_avatar := v_avatars[1];
  if p_participant_count = 2 then
    v_second_id := v_ids[2];
    v_second_name := v_names[2];
    v_second_avatar := v_avatars[2];
  end if;

  insert into public.roulette_draws (
    round_id, first_user_id, first_display_name, second_user_id,
    second_display_name, created_by
  ) values (
    p_round_id, v_first_id, v_first_name, v_second_id,
    v_second_name, auth.uid()
  ) returning id, public.roulette_draws.created_at into v_draw_id, v_created_at;

  insert into public.roulette_exclusions (user_id, excluded_by)
  select selected.user_id, auth.uid() from unnest(v_ids) as selected(user_id)
  on conflict (user_id) do nothing;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'roulette_spun', 'round', p_round_id,
    jsonb_build_object(
      'round_id', p_round_id,
      'round_name', v_round_name,
      'selected_user_ids', to_jsonb(v_ids),
      'selected_names', to_jsonb(v_names),
      'requested_participant_count', p_participant_count
    )
  );

  return query select
    v_draw_id, p_round_id, v_round_name, v_first_id, v_first_name,
    v_first_avatar, v_second_id, v_second_name, v_second_avatar, v_created_at;
end;
$$;

-- Mantém compatibilidade com clientes antigos que ainda chamam a assinatura de 1 parâmetro.
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
begin
  return query select * from public.spin_round_roulette(p_round_id, 2);
end;
$$;

revoke execute on function public.spin_round_roulette(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.spin_round_roulette(uuid, integer) to authenticated;
revoke execute on function public.spin_round_roulette(uuid) from public, anon, authenticated, service_role;
grant execute on function public.spin_round_roulette(uuid) to authenticated;
