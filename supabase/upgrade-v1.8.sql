-- ============================================================
-- CHAMPIONS BOLÃO — UPGRADE v1.8
-- Execute uma vez no SQL Editor se o banco já veio da v1.7.
-- ============================================================

alter table public.rounds
  add column if not exists closed_at timestamptz;

-- Rodadas históricas que já estavam 100% concluídas antes da v1.8
-- são marcadas como encerradas automaticamente para preservar o estado.
update public.rounds r
set closed_at = coalesce(
  (
    select max(m.updated_at)
    from public.matches m
    where m.round_id = r.id
  ),
  now()
)
where r.closed_at is null
  and exists (
    select 1 from public.matches m where m.round_id = r.id
  )
  and not exists (
    select 1
    from public.matches m
    where m.round_id = r.id
      and (m.home_score is null or m.away_score is null)
  );
