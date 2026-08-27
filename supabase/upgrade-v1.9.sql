-- ============================================================
-- CHAMPIONS BOLÃO — UPGRADE v1.9
-- Execute uma vez se o banco já está na v1.8.
-- Corrige a persistência de fotos de participantes.
-- ============================================================

-- O upgrade v1.4 criou avatar_path e as policies de Storage, mas projetos
-- que já haviam aplicado o hardening v1.2 mantiveram profiles somente com
-- SELECT para authenticated. O RLS já limita UPDATE a administradores;
-- concedemos aqui apenas UPDATE da coluna avatar_path.

grant update (avatar_path) on table public.profiles to authenticated;

-- Reafirma a policy administrativa para evitar depender de uma versão
-- anterior do setup.
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
