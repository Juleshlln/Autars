-- Autars backend schema diagnostic
-- Run this in the Supabase SQL Editor after 005_repair_backend_schema.sql.

-- 1. Expected public tables
select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'profiles',
  'workspaces',
  'agents',
  'missions',
  'activity_events',
  'plans',
  'subscriptions',
  'credit_wallets',
  'credit_transactions'
)
order by table_name;

-- 2. missions columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
and table_name = 'missions'
order by ordinal_position;

-- 3. agents columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
and table_name = 'agents'
order by ordinal_position;

-- 4. Expected RPC functions
select routine_name
from information_schema.routines
where routine_schema = 'public'
and routine_name in ('consume_credits', 'award_mission_xp');

-- 5. Seeded plans
select *
from public.plans
order by monthly_credits;

-- 6. Existing wallets
select user_id, balance, monthly_allowance, last_refill_at
from public.credit_wallets;

-- 7. Existing subscriptions
select user_id, plan_id, status
from public.subscriptions;

-- 8. Reload PostgREST schema cache
notify pgrst, 'reload schema';
