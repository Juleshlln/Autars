-- =====================================================================
-- 012 — Security hardening (safe subset from Supabase advisors)
-- =====================================================================
-- Addresses the zero-risk findings from `get_advisors(security)` without
-- touching the loop-critical credit/XP RPCs (consume_credits, award_*, …),
-- whose grants must be changed only with a live end-to-end test.
--
--   * 0011 function_search_path_mutable: pin search_path on set_updated_at +
--     match_memories (the other functions already pin it).
--   * 0028 anon_security_definer: revoke EXECUTE from the PUBLIC role on the
--     two trigger-only functions (handle_new_user / handle_new_workspace) —
--     they run via triggers, never via /rest, so this cannot break anything.
--
-- Still TODO (needs a live test, see PRODUCTION_CHECKLIST): revoke anon/public
-- EXECUTE on consume_credits / refund_credits / award_mission_xp / award_hq_xp /
-- create_mission_from_recommendation / recompute_business_readiness /
-- unlock_dependent_missions, granting only authenticated + service_role.
-- =====================================================================

-- ---- search_path pinning (no behaviour change) ----
alter function public.set_updated_at() set search_path = public;
alter function public.match_memories(vector, uuid, double precision, integer)
  set search_path = public;

-- ---- trigger-only functions: not callable via REST, drop EXECUTE grants ----
-- (Supabase grants EXECUTE to anon/authenticated directly, so revoking PUBLIC
--  alone is not enough — revoke the role grants too. Triggers still run.)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_workspace() from public, anon, authenticated;

notify pgrst, 'reload schema';
