-- =====================================================================
-- Autars - mission progression + agent XP (incremental)
-- =====================================================================
-- Adds: missions.order_index, missions.xp_reward
--       activity_events.event_type 'agent_leveled_up'
--       RPC award_mission_xp(agent_id, xp) — atomic level-up
-- =====================================================================

-- ---------------------------------------------------------------------
-- missions: ordering + per-mission XP reward
-- ---------------------------------------------------------------------
alter table public.missions
  add column if not exists order_index int,
  add column if not exists xp_reward   int not null default 20;

create index if not exists missions_workspace_order_idx
  on public.missions(workspace_id, order_index);

-- ---------------------------------------------------------------------
-- activity_events: widen check to include 'agent_leveled_up'
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
    'credits_consumed','credits_insufficient','credits_granted',
    'agent_leveled_up'
  ));

-- =====================================================================
-- award_mission_xp(p_agent_id, p_xp)
-- =====================================================================
-- Atomic XP grant + optional level-up. Returns the new xp, level and a
-- boolean leveled_up flag so the caller can show a confetti / toast.
--   - locks the agent row
--   - increments xp
--   - while xp >= level * 100  ->  xp -= level * 100, level += 1
--   - logs an 'agent_leveled_up' event for each level gained
-- =====================================================================
create or replace function public.award_mission_xp(
  p_agent_id uuid,
  p_xp       int
)
returns table (
  ok          boolean,
  new_xp      int,
  new_level   int,
  leveled_up  boolean,
  error       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_owner        uuid;
  v_workspace    uuid;
  v_agent_name   text;
  v_xp           int;
  v_level        int;
  v_threshold    int;
  v_gained       int := 0;
begin
  select owner_id, workspace_id, name, xp, level
    into v_owner, v_workspace, v_agent_name, v_xp, v_level
  from public.agents
  where id = p_agent_id
  for update;

  if v_owner is null then
    return query select false, null::int, null::int, false, 'agent_not_found'::text;
    return;
  end if;

  if v_caller is not null and v_caller <> v_owner then
    return query select false, null::int, null::int, false, 'forbidden'::text;
    return;
  end if;

  if p_xp is null or p_xp <= 0 then
    return query select false, v_xp, v_level, false, 'invalid_xp'::text;
    return;
  end if;

  v_xp := v_xp + p_xp;

  -- Roll over thresholds: nextLevelXp = level * 100
  loop
    v_threshold := v_level * 100;
    exit when v_xp < v_threshold;
    v_xp    := v_xp - v_threshold;
    v_level := v_level + 1;
    v_gained := v_gained + 1;

    insert into public.activity_events
      (workspace_id, owner_id, agent_id, event_type, title, description, metadata)
    values (
      v_workspace, v_owner, p_agent_id, 'agent_leveled_up',
      format('%s passe niveau %s', v_agent_name, v_level),
      'Nouveau palier atteint.',
      jsonb_build_object('new_level', v_level, 'xp', v_xp)
    );
  end loop;

  update public.agents
    set xp = v_xp,
        level = v_level,
        updated_at = now()
    where id = p_agent_id;

  return query select true, v_xp, v_level, v_gained > 0, null::text;
end;
$$;

grant execute on function public.award_mission_xp(uuid, int) to authenticated;
