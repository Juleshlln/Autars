-- =====================================================================
-- Autars - real agent runs, deliverables, decisions, memory, context
-- =====================================================================
-- Adds the backend tables that turn the mission flow into a real async
-- orchestration:
--   * workspace_context : structured project brief (replaces the inline
--     META marker in workspaces.description used by the frontend mapper)
--   * agent_runs        : one row per real execution of an agent
--   * deliverables      : versioned output produced by an agent run
--   * decisions         : human-in-the-loop decisions on deliverables
--   * agent_memory      : per-agent durable learnings
--
-- Also:
--   * extends activity_events.event_type to cover the new lifecycle
--   * adds missions.current_deliverable_id pointer
--   * adds RPC create_mission_from_recommendation for the
--     "convert deliverable into next mission" HITL action
--
-- Idempotent. Safe to re-run.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- missions: pointer to current deliverable + agent run idempotency
-- ---------------------------------------------------------------------
alter table public.missions
  add column if not exists current_deliverable_id uuid,
  add column if not exists last_run_id           uuid;

-- ---------------------------------------------------------------------
-- workspace_context
-- ---------------------------------------------------------------------
create table if not exists public.workspace_context (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null unique references public.workspaces(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  business_idea   text,
  target_customer text,
  market          text,
  tone            text,
  constraints     text,
  goals           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workspace_context_owner_idx
  on public.workspace_context(owner_id);

drop trigger if exists workspace_context_set_updated_at on public.workspace_context;
create trigger workspace_context_set_updated_at
  before update on public.workspace_context
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- agent_runs
-- ---------------------------------------------------------------------
create table if not exists public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  mission_id      uuid not null references public.missions(id) on delete cascade,
  status          text not null default 'queued'
    check (status in ('queued','running','waiting_user_decision','completed','failed','cancelled')),
  input_context   jsonb not null default '{}'::jsonb,
  output_summary  text,
  error_message   text,
  model           text,
  token_usage     jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists agent_runs_owner_idx       on public.agent_runs(owner_id);
create index if not exists agent_runs_workspace_idx   on public.agent_runs(workspace_id);
create index if not exists agent_runs_mission_idx     on public.agent_runs(mission_id);
create index if not exists agent_runs_status_idx      on public.agent_runs(status);

-- One active run per mission at a time. Prevents double-clicks racing.
create unique index if not exists agent_runs_active_per_mission
  on public.agent_runs(mission_id)
  where status in ('queued','running');

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------
create table if not exists public.deliverables (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  mission_id         uuid not null references public.missions(id) on delete cascade,
  agent_run_id       uuid references public.agent_runs(id) on delete set null,
  previous_version_id uuid references public.deliverables(id) on delete set null,
  agent_id           uuid references public.agents(id) on delete set null,
  title              text not null,
  type               text not null default 'document',
  content            text,
  structured_content jsonb not null default '{}'::jsonb,
  version            int not null default 1,
  status             text not null default 'pending_validation'
    check (status in ('draft','pending_validation','validated','needs_improvement','rejected','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists deliverables_workspace_idx on public.deliverables(workspace_id);
create index if not exists deliverables_mission_idx   on public.deliverables(mission_id, version desc);
create index if not exists deliverables_owner_idx     on public.deliverables(owner_id);
create index if not exists deliverables_run_idx       on public.deliverables(agent_run_id);

drop trigger if exists deliverables_set_updated_at on public.deliverables;
create trigger deliverables_set_updated_at
  before update on public.deliverables
  for each row execute function public.set_updated_at();

-- Late FK from missions.current_deliverable_id to deliverables.id
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'missions_current_deliverable_fk'
      and conrelid = 'public.missions'::regclass
  ) then
    alter table public.missions
      add constraint missions_current_deliverable_fk
      foreign key (current_deliverable_id)
      references public.deliverables(id)
      on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'missions_last_run_fk'
      and conrelid = 'public.missions'::regclass
  ) then
    alter table public.missions
      add constraint missions_last_run_fk
      foreign key (last_run_id)
      references public.agent_runs(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- decisions
-- ---------------------------------------------------------------------
create table if not exists public.decisions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  mission_id      uuid references public.missions(id) on delete set null,
  deliverable_id  uuid references public.deliverables(id) on delete set null,
  decision_type   text not null
    check (decision_type in (
      'validated',
      'needs_improvement',
      'rejected',
      'converted_to_next_mission'
    )),
  feedback        text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists decisions_workspace_idx   on public.decisions(workspace_id);
create index if not exists decisions_mission_idx     on public.decisions(mission_id);
create index if not exists decisions_deliverable_idx on public.decisions(deliverable_id);
create index if not exists decisions_owner_idx       on public.decisions(owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- agent_memory
-- ---------------------------------------------------------------------
create table if not exists public.agent_memory (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  agent_id           uuid not null references public.agents(id) on delete cascade,
  memory_type        text not null
    check (memory_type in ('fact','preference','constraint','validated_decision','rejected_idea')),
  content            text not null,
  source_mission_id  uuid references public.missions(id) on delete set null,
  source_deliverable_id uuid references public.deliverables(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists agent_memory_agent_idx     on public.agent_memory(agent_id, created_at desc);
create index if not exists agent_memory_workspace_idx on public.agent_memory(workspace_id);

drop trigger if exists agent_memory_set_updated_at on public.agent_memory;
create trigger agent_memory_set_updated_at
  before update on public.agent_memory
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- activity_events: extend event_type to cover the new lifecycle
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
    'agent_created',
    'mission_created',
    'mission_started',
    'mission_completed',
    'mission_failed',
    'agent_status_changed',
    'workspace_updated',
    'workspace_created',
    'credits_consumed',
    'credits_insufficient',
    'credits_granted',
    'agent_leveled_up',
    'run_queued',
    'run_started',
    'run_completed',
    'run_failed',
    'deliverable_created',
    'deliverable_validated',
    'deliverable_iteration_requested',
    'deliverable_rejected',
    'decision_made',
    'next_mission_proposed'
  ));

-- ---------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------
alter table public.workspace_context enable row level security;
alter table public.agent_runs        enable row level security;
alter table public.deliverables      enable row level security;
alter table public.decisions         enable row level security;
alter table public.agent_memory      enable row level security;

grant usage on schema public to authenticated;
grant select on table
  public.workspace_context,
  public.agent_runs,
  public.deliverables,
  public.decisions,
  public.agent_memory
to authenticated;

-- workspace_context : owner can read/update their own row
drop policy if exists workspace_context_select_own on public.workspace_context;
create policy workspace_context_select_own on public.workspace_context
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists workspace_context_update_own on public.workspace_context;
create policy workspace_context_update_own on public.workspace_context
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists workspace_context_insert_own on public.workspace_context;
create policy workspace_context_insert_own on public.workspace_context
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- agent_runs : read only via RLS for end users; writes happen server-side
-- (service role bypasses RLS) but we still allow read.
drop policy if exists agent_runs_select_own on public.agent_runs;
create policy agent_runs_select_own on public.agent_runs
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- deliverables : same shape
drop policy if exists deliverables_select_own on public.deliverables;
create policy deliverables_select_own on public.deliverables
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- decisions : insert via RPC for atomic side effects; allow direct select
drop policy if exists decisions_select_own on public.decisions;
create policy decisions_select_own on public.decisions
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- agent_memory : read-only from client
drop policy if exists agent_memory_select_own on public.agent_memory;
create policy agent_memory_select_own on public.agent_memory
  for select to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.workspace_context to authenticated;
grant insert, update on public.workspace_context to authenticated;

-- ---------------------------------------------------------------------
-- Seed workspace_context for any pre-existing workspace
-- ---------------------------------------------------------------------
insert into public.workspace_context (workspace_id, owner_id, business_idea, goals)
select w.id, w.owner_id, w.description, w.stage
from public.workspaces w
where not exists (
  select 1 from public.workspace_context c
  where c.workspace_id = w.id
);

-- ---------------------------------------------------------------------
-- RPC: create_mission_from_recommendation
-- Atomically converts a deliverable recommendation into a new mission row.
-- ---------------------------------------------------------------------
create or replace function public.create_mission_from_recommendation(
  p_workspace_id uuid,
  p_deliverable_id uuid,
  p_title text,
  p_description text,
  p_agent_id uuid,
  p_type text default 'derived',
  p_cost_credits int default 1,
  p_xp_reward int default 20,
  p_source_mission_id uuid default null
)
returns table (
  ok boolean,
  mission_id uuid,
  error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_max_order int;
  v_new_id uuid;
begin
  if v_caller is null then
    return query select false, null::uuid, 'unauthenticated'::text;
    return;
  end if;

  select owner_id into v_owner from public.workspaces where id = p_workspace_id;
  if v_owner is null then
    return query select false, null::uuid, 'workspace_not_found'::text;
    return;
  end if;
  if v_owner <> v_caller then
    return query select false, null::uuid, 'forbidden'::text;
    return;
  end if;

  select coalesce(max(order_index), 0) into v_max_order
  from public.missions
  where workspace_id = p_workspace_id;

  insert into public.missions (
    workspace_id, owner_id, agent_id, title, description,
    status, priority, cost_credits, type, order_index, xp_reward
  )
  values (
    p_workspace_id, v_caller, p_agent_id,
    coalesce(p_title, 'Mission recommandée'),
    coalesce(p_description, ''),
    'todo', 'medium', coalesce(p_cost_credits, 1),
    coalesce(p_type, 'derived'),
    v_max_order + 1,
    coalesce(p_xp_reward, 20)
  )
  returning id into v_new_id;

  insert into public.decisions
    (owner_id, workspace_id, mission_id, deliverable_id, decision_type, feedback, metadata)
  values (
    v_caller, p_workspace_id, p_source_mission_id, p_deliverable_id,
    'converted_to_next_mission',
    null,
    jsonb_build_object('created_mission_id', v_new_id)
  );

  insert into public.activity_events
    (workspace_id, owner_id, agent_id, mission_id, event_type, title, description, metadata)
  values (
    p_workspace_id, v_caller, p_agent_id, v_new_id,
    'next_mission_proposed',
    format('Nouvelle mission : %s', coalesce(p_title, 'Mission recommandée')),
    'Issue d''un livrable précédent.',
    jsonb_build_object('source_deliverable_id', p_deliverable_id)
  );

  return query select true, v_new_id, null::text;
end;
$$;

revoke all on function public.create_mission_from_recommendation(
  uuid, uuid, text, text, uuid, text, int, int, uuid
) from public;
grant execute on function public.create_mission_from_recommendation(
  uuid, uuid, text, text, uuid, text, int, int, uuid
) to authenticated;

-- ---------------------------------------------------------------------
-- Trigger: seed workspace_context on workspace insert
-- ---------------------------------------------------------------------
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_context
    (workspace_id, owner_id, business_idea)
  values (new.id, new.owner_id, new.description)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ---------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
