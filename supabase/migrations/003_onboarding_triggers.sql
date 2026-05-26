-- =====================================================================
-- Autars - onboarding triggers (incremental)
-- =====================================================================
-- Upgrade handle_new_user(): on signup, every user gets
--   * profile (already done)
--   * subscription on the 'free' plan
--   * credit_wallet with 4 credits
--   * initial_grant transaction
--
-- The workspace itself, its agents and its missions are still created
-- explicitly by the onboarding screen via createWorkspaceWithDefaults,
-- so the user keeps the ability to name their HQ and pick a project type.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_credits int := 4;
begin
  -- profile
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- subscription: free plan
  insert into public.subscriptions (user_id, plan_id, status, current_period_start)
  values (new.id, 'free', 'active', now())
  on conflict do nothing;

  -- credit wallet
  insert into public.credit_wallets (user_id, balance, monthly_allowance, last_refill_at)
  values (new.id, v_free_credits, v_free_credits, now())
  on conflict (user_id) do nothing;

  -- audit trail
  insert into public.credit_transactions (user_id, amount, type, reason)
  values (new.id, v_free_credits, 'initial_grant', 'signup_free_plan');

  return new;
end;
$$;

-- Re-attach trigger (no-op if 001 already set it, but safe to redeclare)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
