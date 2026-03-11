-- KoMe Ai dashboard snapshot table
-- Stores dashboard telemetry snapshots per user in a column-first schema.

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  snapshot_at timestamptz not null,
  timezone text not null default 'UTC',
  ui_theme text not null default 'dark',
  coach_level_selected text not null default '',
  ai_agent_selected text not null default '',
  session_duration_minutes integer not null default 0,
  scenario_current text not null default '',
  challenge_profile jsonb not null default '{}'::jsonb,
  total_sessions integer not null default 0,
  average_performance_percent integer not null default 0,
  overall_average_score numeric(5,2) not null default 0,
  latest_average_score numeric(5,2) not null default 0,
  total_red_flags integer not null default 0,
  total_practice_minutes integer not null default 0,
  practice_goal_progress integer not null default 0,
  momentum_delta numeric(6,2) not null default 0,
  strongest_skill text not null default '',
  strongest_skill_score numeric(5,2) not null default 0,
  focus_skill text not null default '',
  focus_skill_score numeric(5,2) not null default 0,
  latest_quality_band text not null default '',
  latest_quality_score numeric(6,2) not null default 0,
  score_history_points jsonb not null default '[]'::jsonb,
  skill_breakdown jsonb not null default '[]'::jsonb,
  competency_momentum jsonb not null default '[]'::jsonb,
  competency_trajectory jsonb not null default '[]'::jsonb,
  learning_snapshot jsonb not null default '{}'::jsonb,
  latest_feedback jsonb not null default '{}'::jsonb,
  top_recommendations jsonb not null default '[]'::jsonb,
  red_flag_frequency jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dashboard_snapshots enable row level security;

-- Prototype-open policy for fast testing.
-- Tighten this policy before production launch.
drop policy if exists "prototype_dashboard_snapshots_access" on public.dashboard_snapshots;
create policy "prototype_dashboard_snapshots_access"
on public.dashboard_snapshots
for all
to anon, authenticated
using (true)
with check (true);

create index if not exists dashboard_snapshots_user_email_idx
on public.dashboard_snapshots (user_email);

create index if not exists dashboard_snapshots_snapshot_at_idx
on public.dashboard_snapshots (snapshot_at desc);
