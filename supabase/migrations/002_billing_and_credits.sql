-- =====================================================================
-- Autars - billing & credits (incremental)
-- =====================================================================
-- Adds: missions.cost_credits / type / result
--       activity_events new event_types (workspace_created, credits_*)
--       plans, subscriptions, credit_wallets, credit_transactions
--       RLS policies for new tables
--       consume_credits() RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- missions: extend with credit cost, type, result
-- ---------------------------------------------------------------------
alter table public.missions
  add column if not exists cost_credits int  not null default 1,
  add column if not exists type         text,
  add column if not exists result       jsonb;

-- Expand status to cover the spec lifecycle. Drop & recreate the check so
-- 'completed', 'failed', 'waiting_user_decision' become valid alongside legacy.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'missions_status_check'
      and conrelid = 'public.missions'::regclass
  ) then
    alter table public.missions drop constraint missions_status_check;
  end if;
end $$;

alter table public.missions
  add constraint missions_status_check
  check (status in (
    'todo','in_progress','review','done','blocked',
    'waiting_user_decision','completed','failed'
  ));

-- ---------------------------------------------------------------------
-- activity_events: widen event_type enum-check
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'activity_events_event_type_check'
      and conrelid = 'public.activity_events'::regclass
  ) then
    alter table public.activity_events drop constraint activity_events_event_type_check;
  end if;
end $$;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (event_type in (
    'agent_created','mission_created','mission_started','mission_completed',
    'agent_status_changed','workspace_updated','workspace_created',
    'credits_consumed','credits_insufficient','credits_granted'
  ));

-- ---------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id              text primary key,
  name            text not null,
  monthly_credits int  not null,
  price_monthly   int,
  currency        text not null default 'EUR',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

insert into public.plans (id, name, monthly_credits, price_monthly, currency, is_active) values
  ('free',     'Free',       4,    0,    'EUR', true),
  ('starter',  'Starter',    50,   1900, 'EUR', true),
  ('pro',      'Pro',        200,  4900, 'EUR', true),
  ('business', 'Business',   1000, 14900,'EUR', true)
on conflict (id) do update set
  name            = excluded.name,
  monthly_credits = excluded.monthly_credits,
  price_monthly   = excluded.price_monthly,
  currency        = excluded.currency,
  is_active       = excluded.is_active;

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  plan_id              text not null references public.plans(id),
  status               text not null default 'active'
                       check (status in ('active','past_due','canceled','trialing')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists subscriptions_user_active_unique
  on public.subscriptions(user_id)
  where status = 'active';

create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- credit_wallets
-- ---------------------------------------------------------------------
create table if not exists public.credit_wallets (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  balance            int  not null default 0 check (balance >= 0),
  monthly_allowance  int  not null default 0,
  last_refill_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists credit_wallets_user_idx on public.credit_wallets(user_id);

drop trigger if exists credit_wallets_set_updated_at on public.credit_wallets;
create trigger credit_wallets_set_updated_at
  before update on public.credit_wallets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- credit_transactions
-- ---------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  mission_id    uuid references public.missions(id) on delete set null,
  amount        int  not null,
  type          text not null
                check (type in (
                  'initial_grant','monthly_refill','mission_cost',
                  'manual_adjustment','refund'
                )),
  reason        text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists credit_tx_user_idx       on public.credit_transactions(user_id, created_at desc);
create index if not exists credit_tx_workspace_idx  on public.credit_transactions(workspace_id);
create index if not exists credit_tx_mission_idx    on public.credit_transactions(mission_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.plans               enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.credit_wallets      enable row level security;
alter table public.credit_transactions enable row level security;

-- ---- plans: anyone authenticated can read active plans ----
drop policy if exists plans_select_active on public.plans;
create policy plans_select_active on public.plans
  for select
  to authenticated
  using (is_active = true);

-- (no insert/update/delete policy: only service role can mutate)

-- ---- subscriptions: owner-only ----
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (user_id = auth.uid());

drop policy if exists subscriptions_insert_own on public.subscriptions;
create policy subscriptions_insert_own on public.subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists subscriptions_update_own on public.subscriptions;
create policy subscriptions_update_own on public.subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- credit_wallets: owner can read; writes go through RPC (service_role) ----
drop policy if exists credit_wallets_select_own on public.credit_wallets;
create policy credit_wallets_select_own on public.credit_wallets
  for select using (user_id = auth.uid());

-- Allow user to upsert their own wallet (safety net; triggers normally do it).
drop policy if exists credit_wallets_insert_own on public.credit_wallets;
create policy credit_wallets_insert_own on public.credit_wallets
  for insert with check (user_id = auth.uid());

-- No public update policy: balance changes must use consume_credits() (security definer).

-- ---- credit_transactions: owner read-only ----
drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions
  for select using (user_id = auth.uid());

-- =====================================================================
-- consume_credits() RPC
-- =====================================================================
-- Atomic credit consumption:
--  * verifies the caller is the wallet owner (or the function is invoked by service_role)
--  * locks the wallet row
--  * refuses if balance < amount
--  * decrements balance, inserts a credit_transactions row
--  * returns the new balance + transaction id
-- =====================================================================
create or replace function public.consume_credits(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_mission_id   uuid,
  p_amount       int,
  p_reason       text default null
)
returns table (
  ok             boolean,
  new_balance    int,
  transaction_id uuid,
  error          text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_balance  int;
  v_tx_id    uuid;
begin
  -- caller must match unless invoked from server with service role
  if v_caller is not null and v_caller <> p_user_id then
    return query select false, null::int, null::uuid, 'forbidden'::text;
    return;
  end if;

  if p_amount is null or p_amount <= 0 then
    return query select false, null::int, null::uuid, 'invalid_amount'::text;
    return;
  end if;

  -- lock the wallet row to make the read+update atomic
  select balance into v_balance
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  if v_balance is null then
    return query select false, null::int, null::uuid, 'no_wallet'::text;
    return;
  end if;

  if v_balance < p_amount then
    return query select false, v_balance, null::uuid, 'insufficient_credits'::text;
    return;
  end if;

  update public.credit_wallets
    set balance = balance - p_amount,
        updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.credit_transactions
    (user_id, workspace_id, mission_id, amount, type, reason)
  values
    (p_user_id, p_workspace_id, p_mission_id, -p_amount, 'mission_cost', p_reason)
  returning id into v_tx_id;

  return query select true, v_balance, v_tx_id, null::text;
end;
$$;

grant execute on function public.consume_credits(uuid, uuid, uuid, int, text) to authenticated;

-- =====================================================================
-- grant_initial_credits() helper (used by signup trigger)
-- =====================================================================
create or replace function public.grant_initial_credits(
  p_user_id   uuid,
  p_amount    int,
  p_reason    text default 'initial_grant'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.credit_wallets
    set balance        = balance + p_amount,
        last_refill_at = now(),
        updated_at     = now()
    where user_id = p_user_id;

  insert into public.credit_transactions
    (user_id, amount, type, reason)
  values
    (p_user_id, p_amount, 'initial_grant', p_reason);
end;
$$;
