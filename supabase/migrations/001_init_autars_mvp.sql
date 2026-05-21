-- =====================================================================
-- Autars MVP - initial schema
-- =====================================================================
-- Tables: profiles, workspaces, agents, missions, activity_events
-- Security: RLS enabled on every table, owner-only access
-- Auto:    updated_at trigger + new-user -> profile trigger
-- =====================================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- workspaces (= "QG" / business projects)
-- ---------------------------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  stage       text not null default 'idea',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------
create table if not exists public.agents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  role         text not null,
  specialty    text,
  status       text not null default 'idle'
               check (status in ('idle','working','blocked','done')),
  avatar_type  text not null default 'pixel',
  level        integer not null default 1,
  xp           integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists agents_workspace_id_idx on public.agents(workspace_id);
create index if not exists agents_owner_id_idx     on public.agents(owner_id);

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- missions
-- ---------------------------------------------------------------------
create table if not exists public.missions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  agent_id       uuid references public.agents(id) on delete set null,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  description    text,
  status         text not null default 'todo'
                 check (status in ('todo','in_progress','review','done','blocked')),
  priority       text not null default 'medium'
                 check (priority in ('low','medium','high')),
  output_type    text,
  output_content text,
  due_date       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists missions_workspace_id_idx on public.missions(workspace_id);
create index if not exists missions_agent_id_idx     on public.missions(agent_id);
create index if not exists missions_owner_id_idx     on public.missions(owner_id);

drop trigger if exists missions_set_updated_at on public.missions;
create trigger missions_set_updated_at
  before update on public.missions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- activity_events (live feed)
-- ---------------------------------------------------------------------
create table if not exists public.activity_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id     uuid references public.agents(id) on delete set null,
  mission_id   uuid references public.missions(id) on delete set null,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  event_type   text not null
               check (event_type in (
                 'agent_created','mission_created','mission_started',
                 'mission_completed','agent_status_changed','workspace_updated'
               )),
  title        text not null,
  description  text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists activity_events_workspace_idx on public.activity_events(workspace_id, created_at desc);
create index if not exists activity_events_owner_idx     on public.activity_events(owner_id, created_at desc);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.workspaces      enable row level security;
alter table public.agents          enable row level security;
alter table public.missions        enable row level security;
alter table public.activity_events enable row level security;

-- ---- profiles: self-only ----
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- workspaces ----
drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own on public.workspaces
  for select using (owner_id = auth.uid());

drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own on public.workspaces
  for insert with check (owner_id = auth.uid());

drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own on public.workspaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists workspaces_delete_own on public.workspaces;
create policy workspaces_delete_own on public.workspaces
  for delete using (owner_id = auth.uid());

-- ---- agents ----
drop policy if exists agents_select_own on public.agents;
create policy agents_select_own on public.agents
  for select using (owner_id = auth.uid());

drop policy if exists agents_insert_own on public.agents;
create policy agents_insert_own on public.agents
  for insert with check (owner_id = auth.uid());

drop policy if exists agents_update_own on public.agents;
create policy agents_update_own on public.agents
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists agents_delete_own on public.agents;
create policy agents_delete_own on public.agents
  for delete using (owner_id = auth.uid());

-- ---- missions ----
drop policy if exists missions_select_own on public.missions;
create policy missions_select_own on public.missions
  for select using (owner_id = auth.uid());

drop policy if exists missions_insert_own on public.missions;
create policy missions_insert_own on public.missions
  for insert with check (owner_id = auth.uid());

drop policy if exists missions_update_own on public.missions;
create policy missions_update_own on public.missions
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists missions_delete_own on public.missions;
create policy missions_delete_own on public.missions
  for delete using (owner_id = auth.uid());

-- ---- activity_events ----
drop policy if exists activity_select_own on public.activity_events;
create policy activity_select_own on public.activity_events
  for select using (owner_id = auth.uid());

drop policy if exists activity_insert_own on public.activity_events;
create policy activity_insert_own on public.activity_events
  for insert with check (owner_id = auth.uid());

drop policy if exists activity_delete_own on public.activity_events;
create policy activity_delete_own on public.activity_events
  for delete using (owner_id = auth.uid());
