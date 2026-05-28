-- =====================================================================
-- 009 — Mission credit refund RPC + fallback / refund activity events
-- =====================================================================
-- Adds:
--   * refund_credits() RPC  — symmetric counterpart to consume_credits()
--                             used when an agent run fails for technical
--                             reasons (LLM exception, supabase write fault).
--   * activity_events.event_type extended with 'credit_refunded' and
--     'mission_fallback_used' so the live console can render the new
--     lifecycle transitions cleanly.
--   * deliverables.metadata jsonb — bag for orchestrator flags (e.g.
--     `used_fallback`, `fallback_reason`).
--
-- Idempotent. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- activity_events.event_type — append new lifecycle events
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
    'credit_refunded',
    'agent_leveled_up',
    'run_queued',
    'run_started',
    'run_completed',
    'run_failed',
    'agent_thinking',
    'deliverable_created',
    'deliverable_validated',
    'deliverable_iteration_requested',
    'deliverable_rejected',
    'decision_made',
    'next_mission_proposed',
    'mission_fallback_used'
  ));

-- ---------------------------------------------------------------------
-- deliverables.metadata — orchestrator flags
-- ---------------------------------------------------------------------
alter table public.deliverables
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- refund_credits() RPC
-- Atomic credit refund. Mirrors consume_credits but:
--   * accepts an explicit positive amount
--   * inserts a credit_transactions row with type='refund' and positive sign
--   * NEVER lowers balance; cap missing wallet behaviour to a clean error.
-- Idempotency: caller (server) must pass a unique p_reason or rely on
-- p_mission_id to detect duplicate refunds. Best-effort dedup: if a refund
-- already exists for (user, mission, reason) within the last hour, skip.
-- ---------------------------------------------------------------------
create or replace function public.refund_credits(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_mission_id   uuid,
  p_amount       int,
  p_reason       text default 'mission_failed_refund'
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
  v_caller      uuid := auth.uid();
  v_balance     int;
  v_tx_id       uuid;
  v_existing_tx uuid;
begin
  -- Allow server (no auth.uid()) OR matching user only.
  if v_caller is not null and v_caller <> p_user_id then
    return query select false, null::int, null::uuid, 'forbidden'::text;
    return;
  end if;

  if p_amount is null or p_amount <= 0 then
    return query select false, null::int, null::uuid, 'invalid_amount'::text;
    return;
  end if;

  -- Dedup: same mission + reason within the last hour → no-op.
  if p_mission_id is not null then
    select id into v_existing_tx
    from public.credit_transactions
    where user_id = p_user_id
      and mission_id = p_mission_id
      and type = 'refund'
      and coalesce(reason, '') = coalesce(p_reason, '')
      and created_at > now() - interval '1 hour'
    limit 1;
    if v_existing_tx is not null then
      select balance into v_balance
        from public.credit_wallets where user_id = p_user_id;
      return query select true, v_balance, v_existing_tx, null::text;
      return;
    end if;
  end if;

  -- Lock the wallet row to keep read+update atomic.
  select balance into v_balance
    from public.credit_wallets
    where user_id = p_user_id
    for update;

  if v_balance is null then
    return query select false, null::int, null::uuid, 'no_wallet'::text;
    return;
  end if;

  update public.credit_wallets
    set balance     = balance + p_amount,
        updated_at  = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.credit_transactions
    (user_id, workspace_id, mission_id, amount, type, reason)
  values
    (p_user_id, p_workspace_id, p_mission_id, p_amount, 'refund', p_reason)
  returning id into v_tx_id;

  return query select true, v_balance, v_tx_id, null::text;
end;
$$;

revoke all on function public.refund_credits(uuid, uuid, uuid, int, text) from public;
grant execute on function public.refund_credits(uuid, uuid, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
