-- KoMe Ai cloud persistence table
-- Stores full session history and call logs per coach email for prototype usage.

create table if not exists public.coach_state (
  user_email text primary key,
  sessions jsonb not null default '[]'::jsonb,
  call_logs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coach_state enable row level security;

-- Prototype-open policy so anon key can read/write by email.
-- For production, replace this with proper Supabase Auth + user-bound RLS.
drop policy if exists "prototype_coach_state_access" on public.coach_state;
create policy "prototype_coach_state_access"
on public.coach_state
for all
to anon, authenticated
using (true)
with check (true);

create index if not exists coach_state_updated_at_idx
on public.coach_state (updated_at desc);
