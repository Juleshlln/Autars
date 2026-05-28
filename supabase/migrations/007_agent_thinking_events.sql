-- =====================================================================
-- 007 — Agent thinking events
-- =====================================================================
-- Adds the `agent_thinking` event_type so the ReAct loop in
-- server/agents/runAgentMission.ts can stream plan/act/synthesize phase
-- progress to activity_events. Each row's `metadata.phase` carries the
-- specific phase ('plan' | 'act' | 'synthesize').
-- =====================================================================

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
    'agent_thinking',
    'deliverable_created',
    'deliverable_validated',
    'deliverable_iteration_requested',
    'deliverable_rejected',
    'decision_made',
    'next_mission_proposed'
  ));
