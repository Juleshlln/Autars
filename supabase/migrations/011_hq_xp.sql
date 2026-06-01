-- =====================================================================
-- 011 — QG (workspace) XP  (recaptured to match production)
-- =====================================================================
-- `award_hq_xp` already exists in the live "Autars" project (it was created
-- alongside the untracked HQ-runtime work). This file recaptures the EXACT
-- production definition so a fresh `supabase db push` reproduces it and so the
-- repo is the source of truth. Re-applying it is a clean `create or replace`
-- on the identical signature (no overload created).
--
-- IMPORTANT: the signature is (uuid, uuid, integer, text DEFAULT NULL) and the
-- HQ threshold is `level * 250` (agents use `level * 100`). The server calls it
-- with 3 named args from handleAgentDecide on validation; `p_reason` defaults.
-- Idempotent + best-effort caller, so it is safe to apply at any time.
-- =====================================================================

create or replace function public.award_hq_xp(
  p_user_id      uuid,
  p_workspace_id uuid,
  p_xp           integer,
  p_reason       text default null
)
returns table (
  ok          boolean,
  new_xp      integer,
  new_level   integer,
  leveled_up  boolean,
  error       text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid(); v_owner uuid; v_name text;
  v_xp int; v_level int; v_threshold int; v_gained int := 0;
begin
  if p_user_id is null then return query select false, null::int, null::int, false, 'missing_user'::text; return; end if;
  if v_caller is not null and v_caller <> p_user_id then return query select false, null::int, null::int, false, 'forbidden'::text; return; end if;
  if p_xp is null or p_xp <= 0 then return query select false, null::int, null::int, false, 'invalid_xp'::text; return; end if;
  select owner_id, name, xp, level into v_owner, v_name, v_xp, v_level from public.workspaces where id = p_workspace_id for update;
  if v_owner is null then return query select false, null::int, null::int, false, 'workspace_not_found'::text; return; end if;
  if v_owner <> p_user_id then return query select false, null::int, null::int, false, 'workspace_forbidden'::text; return; end if;
  v_xp := v_xp + p_xp;
  loop
    v_threshold := v_level * 250;
    exit when v_xp < v_threshold;
    v_xp := v_xp - v_threshold; v_level := v_level + 1; v_gained := v_gained + 1;
    insert into public.activity_events (workspace_id, owner_id, event_type, title, description, metadata)
    values (p_workspace_id, p_user_id, 'hq_leveled_up', format('Le QG passe niveau %s', v_level),
      coalesce(p_reason, 'Nouveau palier atteint pour la filiale.'),
      jsonb_build_object('new_level', v_level, 'xp', v_xp));
  end loop;
  update public.workspaces set xp = v_xp, level = v_level, updated_at = now() where id = p_workspace_id;
  return query select true, v_xp, v_level, v_gained > 0, null::text;
end; $function$;

revoke all on function public.award_hq_xp(uuid, uuid, integer, text) from public;
grant execute on function public.award_hq_xp(uuid, uuid, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';
