-- Champions Bolão v1.22
-- Guarda qual participante escolheu cada partida da rodada.

alter table public.matches
  add column if not exists selected_by_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_matches_selected_by_user
  on public.matches(selected_by_user_id);
