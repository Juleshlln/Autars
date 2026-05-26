-- =====================================================================
-- Autars - repair backend schema for billing, credits and mission fields
-- =====================================================================
-- Purpose:
--   * repair databases that only received the MVP schema or a partial
--     backend migration set;
--   * keep product data on owner_id and billing/credit data on user_id;
--   * preserve RLS and expose the expected public tables through PostgREST.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Shared updated_at trigger helper
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
-- missions: repair columns expected by the current frontend/backend code
-- ---------------------------------------------------------------------
alter table public.missions
  add column if not exists cost_credits     int not null default 1,
  add column if not exists type             text,
  add column if not exists result           jsonb,
  add column if not exists order_index      int,
  add column if not exists xp_reward        int not null default 20,
  add column if not exists started_at       timestamptz,
  add column if not exists completed_at     timestamptz,
  add column if not exists xp_awarded       boolean not null default false,
  add column if not exists simulation_due_at timestamptz;

update public.missions
set
  cost_credits = coalesce(cost_credits, 1),
  xp_reward = coalesce(xp_reward, 20),
  xp_awarded = coalesce(xp_awarded, false);

alter table public.missions
  alter column cost_credits set default 1,
  alter column cost_credits set not null,
  alter column xp_reward set default 20,
  alter column xp_reward set not null,
  alter column xp_awarded set default false,
  alter column xp_awarded set not null;

create index if not exists missions_workspace_order_idx
  on public.missions(workspace_id, order_index);

-- Keep legacy statuses valid while adding the newer mission lifecycle.
do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.missions'::regclass
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.missions drop constraint %I', v_constraint_name);
  end loop;
end $$;

alter table public.missions
  add constraint missions_status_check
  check (status in (
    'todo',
    'in_progress',
    'review',
    'done',
    'blocked',
    'waiting_user_decision',
    'completed',
    'failed'
  ));

-- ---------------------------------------------------------------------
-- agents: repair progression/profile columns expected by the code
-- ---------------------------------------------------------------------
alter table public.agents
  add column if not exists specialty   text,
  add column if not exists level       int not null default 1,
  add column if not exists xp          int not null default 0,
  add column if not exists avatar_type text not null default 'pixel';

update public.agents
set
  level = coalesce(level, 1),
  xp = coalesce(xp, 0),
  avatar_type = coalesce(avatar_type, 'pixel');

alter table public.agents
  alter column level set default 1,
  alter column level set not null,
  alter column xp set default 0,
  alter column xp set not null,
  alter column avatar_type set default 'pixel',
  alter column avatar_type set not null;

-- ---------------------------------------------------------------------
-- activity_events: allow events emitted by credits/progression flows
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
    'agent_status_changed',
    'workspace_updated',
    'workspace_created',
    'credits_consumed',
    'credits_insufficient',
    'credits_granted',
    'agent_leveled_up'
  ));

-- ---------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id              text primary key,
  name            text not null,
  monthly_credits int not null,
  price_monthly   int,
  currency        text not null default 'EUR',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.plans
  add column if not exists name            text,
  add column if not exists monthly_credits int,
  add column if not exists price_monthly   int,
  add column if not exists currency        text default 'EUR',
  add column if not exists is_active       boolean default true,
  add column if not exists created_at      timestamptz default now();

alter table public.plans
  alter column currency set default 'EUR',
  alter column is_active set default true,
  alter column created_at set default now();

insert into public.plans (id, name, monthly_credits, price_monthly, currency, is_active)
values
  ('free', 'Free', 4, 0, 'EUR', true),
  ('starter', 'Starter', 50, 19, 'EUR', true),
  ('pro', 'Pro', 200, 49, 'EUR', true),
  ('business', 'Business', 1000, 149, 'EUR', true)
on conflict (id) do update
set
  name = excluded.name,
  monthly_credits = excluded.monthly_credits,
  price_monthly = excluded.price_monthly,
  currency = excluded.currency,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  plan_id              text not null references public.plans(id),
  status               text not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists user_id              uuid references auth.users(id) on delete cascade,
  add column if not exists plan_id              text references public.plans(id),
  add column if not exists status               text default 'active',
  add column if not exists current_period_start timestamptz default now(),
  add column if not exists current_period_end   timestamptz,
  add column if not exists created_at           timestamptz default now(),
  add column if not exists updated_at           timestamptz default now();

alter table public.subscriptions
  alter column status set default 'active',
  alter column current_period_start set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();

create index if not exists subscriptions_user_idx
  on public.subscriptions(user_id);

create unique index if not exists subscriptions_user_active_unique
  on public.subscriptions(user_id)
  where status = 'active';

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- credit_wallets
-- ---------------------------------------------------------------------
create table if not exists public.credit_wallets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users(id) on delete cascade,
  balance           int not null default 0,
  monthly_allowance int not null default 0,
  last_refill_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.credit_wallets
  add column if not exists user_id           uuid references auth.users(id) on delete cascade,
  add column if not exists balance           int default 0,
  add column if not exists monthly_allowance int default 0,
  add column if not exists last_refill_at    timestamptz,
  add column if not exists created_at        timestamptz default now(),
  add column if not exists updated_at        timestamptz default now();

update public.credit_wallets
set
  balance = coalesce(balance, 0),
  monthly_allowance = coalesce(monthly_allowance, 0);

alter table public.credit_wallets
  alter column balance set default 0,
  alter column balance set not null,
  alter column monthly_allowance set default 0,
  alter column monthly_allowance set not null,
  alter column created_at set default now(),
  alter column updated_at set default now();

create unique index if not exists credit_wallets_user_unique
  on public.credit_wallets(user_id);

create index if not exists credit_wallets_user_idx
  on public.credit_wallets(user_id);

drop trigger if exists credit_wallets_set_updated_at on public.credit_wallets;
create trigger credit_wallets_set_updated_at
  before update on public.credit_wallets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- credit_transactions
-- ---------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  mission_id   uuid references public.missions(id) on delete set null,
  amount       int not null,
  type         text not null,
  reason       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.credit_transactions
  add column if not exists user_id      uuid references auth.users(id) on delete cascade,
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists mission_id   uuid references public.missions(id) on delete set null,
  add column if not exists amount       int,
  add column if not exists type         text,
  add column if not exists reason       text,
  add column if not exists metadata     jsonb default '{}'::jsonb,
  add column if not exists created_at   timestamptz default now();

update public.credit_transactions
set metadata = coalesce(metadata, '{}'::jsonb);

alter table public.credit_transactions
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now();

create index if not exists credit_tx_user_idx
  on public.credit_transactions(user_id, created_at desc);

create index if not exists credit_tx_workspace_idx
  on public.credit_transactions(workspace_id);

create index if not exists credit_tx_mission_idx
  on public.credit_transactions(mission_id);

-- ---------------------------------------------------------------------
-- Row Level Security and REST privileges
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_transactions enable row level security;

grant usage on schema public to authenticated;
grant select on table
  public.plans,
  public.subscriptions,
  public.credit_wallets,
  public.credit_transactions
to authenticated;

drop policy if exists plans_select_active on public.plans;
create policy plans_select_active on public.plans
  for select
  to authenticated
  using (is_active = true);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Remove older permissive client-side billing mutation policies if present.
drop policy if exists subscriptions_insert_own on public.subscriptions;
drop policy if exists subscriptions_update_own on public.subscriptions;

drop policy if exists credit_wallets_select_own on public.credit_wallets;
create policy credit_wallets_select_own on public.credit_wallets
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists credit_wallets_insert_own on public.credit_wallets;

drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- RPC: consume_credits
-- ---------------------------------------------------------------------
create or replace function public.consume_credits(
  p_user_id uuid,
  p_workspace_id uuid,
  p_mission_id uuid,
  p_amount int,
  p_reason text default null
)
returns table (
  ok boolean,
  new_balance int,
  transaction_id uuid,
  error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_wallet_balance int;
  v_transaction_id uuid;
  v_amount int := p_amount;
  v_workspace_owner uuid;
  v_mission_owner uuid;
  v_mission_workspace uuid;
  v_mission_cost int;
begin
  if p_user_id is null then
    return query select false, null::int, null::uuid, 'missing_user'::text;
    return;
  end if;

  if v_caller is not null and v_caller <> p_user_id then
    return query select false, null::int, null::uuid, 'forbidden'::text;
    return;
  end if;

  if p_amount is null or p_amount <= 0 then
    return query select false, null::int, null::uuid, 'invalid_amount'::text;
    return;
  end if;

  if p_workspace_id is not null then
    select owner_id
      into v_workspace_owner
    from public.workspaces
    where id = p_workspace_id;

    if v_workspace_owner is null then
      return query select false, null::int, null::uuid, 'workspace_not_found'::text;
      return;
    end if;

    if v_workspace_owner <> p_user_id then
      return query select false, null::int, null::uuid, 'workspace_forbidden'::text;
      return;
    end if;
  end if;

  if p_mission_id is not null then
    select owner_id, workspace_id, cost_credits
      into v_mission_owner, v_mission_workspace, v_mission_cost
    from public.missions
    where id = p_mission_id;

    if v_mission_owner is null then
      return query select false, null::int, null::uuid, 'mission_not_found'::text;
      return;
    end if;

    if v_mission_owner <> p_user_id then
      return query select false, null::int, null::uuid, 'mission_forbidden'::text;
      return;
    end if;

    if p_workspace_id is not null and v_mission_workspace <> p_workspace_id then
      return query select false, null::int, null::uuid, 'workspace_mismatch'::text;
      return;
    end if;

    if v_mission_cost is not null and v_mission_cost > 0 then
      v_amount := v_mission_cost;
    end if;
  end if;

  select balance
    into v_wallet_balance
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  if v_wallet_balance is null then
    return query select false, null::int, null::uuid, 'no_wallet'::text;
    return;
  end if;

  if v_wallet_balance < v_amount then
    return query select false, v_wallet_balance, null::uuid, 'insufficient_credits'::text;
    return;
  end if;

  update public.credit_wallets
  set
    balance = balance - v_amount,
    updated_at = now()
  where user_id = p_user_id
  returning balance into v_wallet_balance;

  insert into public.credit_transactions
    (user_id, workspace_id, mission_id, amount, type, reason, metadata)
  values
    (
      p_user_id,
      p_workspace_id,
      p_mission_id,
      -v_amount,
      'mission_cost',
      p_reason,
      jsonb_build_object('source', 'consume_credits', 'charged_amount', v_amount)
    )
  returning id into v_transaction_id;

  return query select true, v_wallet_balance, v_transaction_id, null::text;
end;
$$;

revoke all on function public.consume_credits(uuid, uuid, uuid, int, text) from public;
grant execute on function public.consume_credits(uuid, uuid, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- RPC: award_mission_xp
-- ---------------------------------------------------------------------
create or replace function public.award_mission_xp(
  p_user_id uuid,
  p_agent_id uuid,
  p_xp int
)
returns table (
  ok boolean,
  new_xp int,
  new_level int,
  leveled_up boolean,
  error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_workspace uuid;
  v_agent_name text;
  v_xp int;
  v_level int;
  v_threshold int;
  v_gained int := 0;
begin
  if p_user_id is null then
    return query select false, null::int, null::int, false, 'missing_user'::text;
    return;
  end if;

  if v_caller is not null and v_caller <> p_user_id then
    return query select false, null::int, null::int, false, 'forbidden'::text;
    return;
  end if;

  select owner_id, workspace_id, name, xp, level
    into v_owner, v_workspace, v_agent_name, v_xp, v_level
  from public.agents
  where id = p_agent_id
  for update;

  if v_owner is null then
    return query select false, null::int, null::int, false, 'agent_not_found'::text;
    return;
  end if;

  if v_owner <> p_user_id then
    return query select false, null::int, null::int, false, 'agent_forbidden'::text;
    return;
  end if;

  if p_xp is null or p_xp <= 0 then
    return query select false, v_xp, v_level, false, 'invalid_xp'::text;
    return;
  end if;

  v_xp := v_xp + p_xp;

  loop
    v_threshold := v_level * 100;
    exit when v_xp < v_threshold;

    v_xp := v_xp - v_threshold;
    v_level := v_level + 1;
    v_gained := v_gained + 1;

    insert into public.activity_events
      (workspace_id, owner_id, agent_id, event_type, title, description, metadata)
    values (
      v_workspace,
      v_owner,
      p_agent_id,
      'agent_leveled_up',
      format('%s passe niveau %s', v_agent_name, v_level),
      'Nouveau palier atteint.',
      jsonb_build_object('new_level', v_level, 'xp', v_xp)
    );
  end loop;

  update public.agents
  set
    xp = v_xp,
    level = v_level,
    updated_at = now()
  where id = p_agent_id;

  return query select true, v_xp, v_level, v_gained > 0, null::text;
end;
$$;

-- Backward-compatible wrapper for the current frontend RPC call.
create or replace function public.award_mission_xp(
  p_agent_id uuid,
  p_xp int
)
returns table (
  ok boolean,
  new_xp int,
  new_level int,
  leveled_up boolean,
  error text
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.award_mission_xp((select auth.uid()), p_agent_id, p_xp);
$$;

revoke all on function public.award_mission_xp(uuid, uuid, int) from public;
revoke all on function public.award_mission_xp(uuid, int) from public;
grant execute on function public.award_mission_xp(uuid, uuid, int) to authenticated;
grant execute on function public.award_mission_xp(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- Onboarding trigger: profile + free subscription + 4-credit wallet
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_credits int;
begin
  select monthly_credits
    into v_free_credits
  from public.plans
  where id = 'free';

  v_free_credits := coalesce(v_free_credits, 4);

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.subscriptions
    (user_id, plan_id, status, current_period_start)
  select new.id, 'free', 'active', now()
  where not exists (
    select 1
    from public.subscriptions s
    where s.user_id = new.id
      and s.status = 'active'
  );

  insert into public.credit_wallets
    (user_id, balance, monthly_allowance, last_refill_at)
  values
    (new.id, v_free_credits, v_free_credits, now())
  on conflict (user_id) do nothing;

  insert into public.credit_transactions
    (user_id, amount, type, reason, metadata)
  select
    new.id,
    v_free_credits,
    'initial_grant',
    'signup_free_plan',
    jsonb_build_object('plan_id', 'free', 'source', 'handle_new_user')
  where not exists (
    select 1
    from public.credit_transactions t
    where t.user_id = new.id
      and t.type = 'initial_grant'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

notify pgrst, 'reload schema';
