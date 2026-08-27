-- ============================================================
-- CHAMPIONS BOLÃO — UPGRADE v1.4
-- Execute no SQL Editor SOMENTE se seu banco já estava na v1.3.
-- Adiciona fotos de participantes usando Supabase Storage privado.
-- ============================================================

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read_authenticated on storage.objects;
drop policy if exists avatars_admin_insert on storage.objects;
drop policy if exists avatars_admin_update on storage.objects;
drop policy if exists avatars_admin_delete on storage.objects;

create policy avatars_read_authenticated
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

create policy avatars_admin_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());

create policy avatars_admin_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

create policy avatars_admin_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin());

-- Profiles stay protected by RLS; this grant only enables the admin avatar update policy.
grant update (avatar_path) on table public.profiles to authenticated;
