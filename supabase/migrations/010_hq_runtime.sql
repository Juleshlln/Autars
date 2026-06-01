-- =====================================================================
-- 010 — HQ runtime (recaptured)
-- =====================================================================
-- This migration was applied to the live Supabase project ("Autars")
-- but its SQL was never committed to the repo, so a fresh `supabase db
-- push` from 001..009 did NOT reproduce production. This file recaptures
-- it so the repo is once again the source of truth.
--
-- Everything here is ADDITIVE and IDEMPOTENT (create ... if not exists /
-- add column if not exists / drop policy if exists). Re-running it on the
-- live DB is a no-op.
--
-- It adds:
--   * agents.status: 'thinking' + 'waiting_validation'
--   * extra columns on missions / workspaces / agents / deliverables
--   * tables mission_steps, tool_calls, hq_metrics (+ RLS + indexes)
--   * the full activity_events.event_type allow-list
-- =====================================================================

-- ---------------------------------------------------------------------
-- agents.status — allow the richer runtime states
-- ---------------------------------------------------------------------
do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.agents'::regclass
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.agents drop constraint %I', v_constraint_name);
  end loop;
end $$;

alter table public.agents
  add constraint agents_status_check
  check (status in ('idle','thinking','working','waiting_validation','blocked','done'));

-- ---------------------------------------------------------------------
-- Column top-ups (all guarded with "if not exists")
-- ---------------------------------------------------------------------
alter table public.missions
  add column if not exists category             text,
  add column if not exists required_level       integer not null default 1,
  add column if not exists expected_output_type text,
  add column if not exists input_schema         jsonb   not null default '{}'::jsonb;

alter table public.workspaces
  add column if not exists business_score integer not null default 0,
  add column if not exists level          integer not null default 1,
  add column if not exists xp             integer not null default 0;

alter table public.agents
  add column if not exists description       text,
  add column if not exists personality       text,
  add column if not exists avatar_skin       text,
  add column if not exists tools_allowed     jsonb not null default '[]'::jsonb,
  add column if not exists current_mission_id uuid;

alter table public.deliverables
  add column if not exists html_content     text,
  add column if not exists markdown_content text,
  add column if not exists quality_score    integer,
  add column if not exists preview_url      text;

-- agents.current_mission_id → missions FK (guarded; missions may reference
-- agents too, so this is a deferred-friendly set null on delete).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_current_mission_fk'
  ) then
    alter table public.agents
      add constraint agents_current_mission_fk
      foreign key (current_mission_id)
      references public.missions(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- mission_steps — per-run ReAct step trace
-- ---------------------------------------------------------------------
create table if not exists public.mission_steps (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mission_id   uuid not null references public.missions(id) on delete cascade,
  run_id       uuid not null references public.agent_runs(id) on delete cascade,
  agent_id     uuid references public.agents(id) on delete set null,
  step_index   integer not null,
  phase        text not null
    check (phase in ('plan','act','tool','synthesize','quality','finalize')),
  title        text not null,
  description  text,
  status       text not null default 'pending'
    check (status in ('pending','running','completed','failed','skipped')),
  started_at   timestamptz,
  completed_at timestamptz,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists mission_steps_run_idx     on public.mission_steps(run_id, step_index);
create index if not exists mission_steps_mission_idx on public.mission_steps(mission_id, created_at desc);

drop trigger if exists mission_steps_set_updated_at on public.mission_steps;
create trigger mission_steps_set_updated_at
  before update on public.mission_steps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- tool_calls — every tool/action/memory invocation inside a run
-- ---------------------------------------------------------------------
create table if not exists public.tool_calls (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id       uuid not null references public.agent_runs(id) on delete cascade,
  mission_id   uuid references public.missions(id) on delete set null,
  agent_id     uuid references public.agents(id) on delete set null,
  step_id      uuid references public.mission_steps(id) on delete set null,
  tool_name    text not null,
  tool_kind    text not null check (tool_kind in ('tool','action','memory')),
  tool_input   jsonb not null default '{}'::jsonb,
  tool_output  jsonb,
  status       text not null default 'pending'
    check (status in ('pending','success','failed')),
  error_message text,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);
create index if not exists tool_calls_run_idx     on public.tool_calls(run_id, created_at);
create index if not exists tool_calls_mission_idx on public.tool_calls(mission_id);

-- ---------------------------------------------------------------------
-- hq_metrics — numeric KPIs observed for a workspace over time
-- ---------------------------------------------------------------------
create table if not exists public.hq_metrics (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_name  text not null,
  metric_value numeric not null,
  source       text,
  metadata     jsonb not null default '{}'::jsonb,
  observed_at  timestamptz not null default now()
);
create index if not exists hq_metrics_workspace_idx on public.hq_metrics(workspace_id, observed_at desc);

-- ---------------------------------------------------------------------
-- RLS + grants (owner-scoped read; writes happen server-side via the
-- service role, which bypasses RLS — same pattern as 006).
-- ---------------------------------------------------------------------
alter table public.mission_steps enable row level security;
alter table public.tool_calls    enable row level security;
alter table public.hq_metrics    enable row level security;

grant select on table
  public.mission_steps,
  public.tool_calls,
  public.hq_metrics
to authenticated;

drop policy if exists mission_steps_select_own on public.mission_steps;
create policy mission_steps_select_own on public.mission_steps
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists tool_calls_select_own on public.tool_calls;
create policy tool_calls_select_own on public.tool_calls
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists hq_metrics_select_own on public.hq_metrics;
create policy hq_metrics_select_own on public.hq_metrics
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- activity_events.event_type — full runtime allow-list
-- ---------------------------------------------------------------------
do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.activity_events'::regclass
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format('alter table public.activity_events drop constraint %I', v_constraint_name);
  end loop;
end $$;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (event_type in (
    'agent_created','mission_created','mission_started','mission_completed',
    'mission_failed','agent_status_changed','workspace_updated','workspace_created',
    'credits_consumed','credits_insufficient','credits_granted','credit_refunded',
    'agent_leveled_up','run_queued','run_started','run_completed','run_failed',
    'agent_thinking','deliverable_created','deliverable_validated',
    'deliverable_iteration_requested','deliverable_rejected','decision_made',
    'next_mission_proposed','mission_fallback_used','step_started','step_completed',
    'step_failed','tool_called','tool_failed','artifact_quality_scored',
    'hq_leveled_up','readiness_updated','mission_unlocked'
  ));
