-- =====================================================================
-- 011 — QG (workspace) XP
-- =====================================================================
-- Agent XP already exists (award_mission_xp). This adds the matching grant
-- for the HQ itself so the QG levels up as missions are validated. Same
-- rolling formula as agents (nextLevelXp = level * 100, XP rolls over) so
-- the two progression systems stay consistent.
--
-- Called server-side (service role) from handleAgentDecide on validation.
-- Best-effort on the caller side: if this RPC is absent the validation
-- still succeeds, so applying this migration is safe at any time.
-- =====================================================================

create or replace function public.award_hq_xp(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_xp           int
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
  v_caller    uuid := auth.uid();
  v_owner     uuid;
  v_name      text;
  v_xp        int;
  v_level     int;
  v_threshold int;
  v_gained    int := 0;
begin
  if p_user_id is null then
    return query select false, null::int, null::int, false, 'missing_user'::text;
    return;
  end if;

  -- When called by an end user (auth.uid() set), enforce ownership. The
  -- service role has a null auth.uid() and is trusted.
  if v_caller is not null and v_caller <> p_user_id then
    return query select false, null::int, null::int, false, 'forbidden'::text;
    return;
  end if;

  select owner_id, name, coalesce(xp, 0), coalesce(level, 1)
    into v_owner, v_name, v_xp, v_level
  from public.workspaces
  where id = p_workspace_id
  for update;

  if v_owner is null then
    return query select false, null::int, null::int, false, 'workspace_not_found'::text;
    return;
  end if;

  if v_owner <> p_user_id then
    return query select false, null::int, null::int, false, 'workspace_forbidden'::text;
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
      (workspace_id, owner_id, event_type, title, description, metadata)
    values (
      p_workspace_id,
      v_owner,
      'hq_leveled_up',
      format('QG « %s » passe niveau %s', v_name, v_level),
      'Le quartier général gagne un palier.',
      jsonb_build_object('new_level', v_level, 'xp', v_xp)
    );
  end loop;

  update public.workspaces
    set xp = v_xp,
        level = v_level,
        updated_at = now()
    where id = p_workspace_id;

  return query select true, v_xp, v_level, v_gained > 0, null::text;
end;
$$;

revoke all on function public.award_hq_xp(uuid, uuid, int) from public;
grant execute on function public.award_hq_xp(uuid, uuid, int) to authenticated;

notify pgrst, 'reload schema';
