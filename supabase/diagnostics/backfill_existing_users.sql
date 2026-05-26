-- Autars backfill for users created before billing/credit tables existed.
-- Run after 005_repair_backend_schema.sql.
--
-- This script does not top up existing wallets. It only creates missing
-- subscriptions/wallets and records an initial_grant transaction for wallets
-- created by this backfill.

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

insert into public.subscriptions
  (user_id, plan_id, status, current_period_start)
select
  u.id,
  'free',
  'active',
  now()
from auth.users u
where not exists (
  select 1
  from public.subscriptions s
  where s.user_id = u.id
    and s.status = 'active'
);

with missing_wallet_users as (
  select u.id as user_id
  from auth.users u
  where not exists (
    select 1
    from public.credit_wallets w
    where w.user_id = u.id
  )
),
inserted_wallets as (
  insert into public.credit_wallets
    (user_id, balance, monthly_allowance, last_refill_at)
  select
    user_id,
    4,
    4,
    now()
  from missing_wallet_users
  on conflict (user_id) do nothing
  returning user_id
)
insert into public.credit_transactions
  (user_id, amount, type, reason, metadata)
select
  iw.user_id,
  4,
  'initial_grant',
  'backfill_free_plan',
  jsonb_build_object('plan_id', 'free', 'source', 'backfill_existing_users')
from inserted_wallets iw
where not exists (
  select 1
  from public.credit_transactions t
  where t.user_id = iw.user_id
    and t.type = 'initial_grant'
);

notify pgrst, 'reload schema';
