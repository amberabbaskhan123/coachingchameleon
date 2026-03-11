-- KoMe Ai login telemetry table
-- Stores one row per successful login with selected practice configuration.

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  login_at timestamptz not null,
  coaching_scenario_description text not null default '',
  wildcard_scenario_description text not null default '',
  level_selected text not null,
  ambiguity_level smallint not null check (ambiguity_level between 1 and 5),
  resistance_level smallint not null check (resistance_level between 1 and 5),
  emotional_volatility_level smallint not null check (emotional_volatility_level between 1 and 5),
  goal_conflict_level smallint not null check (goal_conflict_level between 1 and 5),
  ai_agent_selected text not null,
  ai_model_selected text not null,
  session_duration_minutes integer not null check (session_duration_minutes > 0),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

alter table public.login_events enable row level security;

-- Prototype-open policy for quick testing.
-- For production, lock this to authenticated user ownership.
drop policy if exists "prototype_login_events_access" on public.login_events;
create policy "prototype_login_events_access"
on public.login_events
for all
to anon, authenticated
using (true)
with check (true);

create index if not exists login_events_user_email_idx
on public.login_events (user_email);

create index if not exists login_events_login_at_idx
on public.login_events (login_at desc);
