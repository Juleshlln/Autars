-- =====================================================================
-- LEGACY SEED - do NOT use for normal onboarding.
-- =====================================================================
-- Normal onboarding is now driven by:
--   * migrations/003_onboarding_triggers.sql  (profile + subscription + wallet)
--   * services/workspacesService.ts           (workspace + agents + missions)
--
-- This file is kept only for debugging and one-off demos. It hard-codes
-- a single user uuid and inserts data on its behalf — never run it on a
-- real multi-user database.
--
-- Replace YOUR_USER_ID_HERE with an auth.users.id you control. Then:
--   psql "$SUPABASE_DB_URL" -f supabase/seed_legacy.sql
-- =====================================================================

do $$
declare
  v_user_id    uuid := 'YOUR_USER_ID_HERE'::uuid;
  v_workspace  uuid;
  v_strategist uuid;
  v_designer   uuid;
  v_growth     uuid;
  v_finance    uuid;
  v_mission_1  uuid;
  v_mission_2  uuid;
  v_mission_3  uuid;
begin
  -- ---- workspace ----
  insert into public.workspaces (owner_id, name, description, stage)
  values (v_user_id, 'QG Autars', 'Premier QG de démonstration Autars.', 'idea')
  returning id into v_workspace;

  -- ---- agents ----
  insert into public.agents (workspace_id, owner_id, name, role, specialty, status, level, xp)
  values (v_workspace, v_user_id, 'Stratège Business', 'Stratège', 'Vision, positionnement, décisions clés', 'working', 2, 120)
  returning id into v_strategist;

  insert into public.agents (workspace_id, owner_id, name, role, specialty, status, level, xp)
  values (v_workspace, v_user_id, 'Designer UX', 'Designer', 'Landing pages, parcours utilisateur', 'idle', 1, 40)
  returning id into v_designer;

  insert into public.agents (workspace_id, owner_id, name, role, specialty, status, level, xp)
  values (v_workspace, v_user_id, 'Growth Marketer', 'Growth', 'Acquisition, canaux, campagnes', 'working', 1, 80)
  returning id into v_growth;

  insert into public.agents (workspace_id, owner_id, name, role, specialty, status, level, xp)
  values (v_workspace, v_user_id, 'Analyste Finance', 'Finance', 'Modèle éco, pricing, prévisions', 'idle', 1, 20)
  returning id into v_finance;

  -- ---- missions ----
  insert into public.missions (workspace_id, agent_id, owner_id, title, description, status, priority)
  values (v_workspace, v_strategist, v_user_id, 'Clarifier l''idée business',
          'Reformuler le problème, la cible et la promesse en 1 page.', 'in_progress', 'high')
  returning id into v_mission_1;

  insert into public.missions (workspace_id, agent_id, owner_id, title, description, status, priority)
  values (v_workspace, v_strategist, v_user_id, 'Définir le positionnement',
          'Choisir un angle, une cible prioritaire et 3 différenciateurs.', 'todo', 'high');

  insert into public.missions (workspace_id, agent_id, owner_id, title, description, status, priority)
  values (v_workspace, v_designer, v_user_id, 'Construire une landing page',
          'Wireframe + copie d''une landing simple orientée conversion.', 'todo', 'medium')
  returning id into v_mission_2;

  insert into public.missions (workspace_id, agent_id, owner_id, title, description, status, priority)
  values (v_workspace, v_growth, v_user_id, 'Préparer une première campagne d''acquisition',
          'Choisir 2 canaux, rédiger les messages, planifier 7 jours.', 'in_progress', 'medium')
  returning id into v_mission_3;

  insert into public.missions (workspace_id, agent_id, owner_id, title, description, status, priority)
  values (v_workspace, v_finance, v_user_id, 'Estimer le modèle économique',
          'Hypothèses de revenus, coûts, pricing et seuil de rentabilité.', 'todo', 'medium');

  insert into public.missions (workspace_id, agent_id, owner_id, title, description, status, priority)
  values (v_workspace, v_strategist, v_user_id, 'Créer une roadmap MVP',
          '4 jalons à 30/60/90/120 jours avec livrables clairs.', 'todo', 'low');

  -- ---- activity feed ----
  insert into public.activity_events (workspace_id, owner_id, event_type, title, description)
  values (v_workspace, v_user_id, 'workspace_updated', 'QG Autars créé',
          'Premier QG initialisé avec 4 agents et 6 missions.');

  insert into public.activity_events (workspace_id, agent_id, owner_id, event_type, title, description)
  values (v_workspace, v_strategist, v_user_id, 'agent_created', 'Stratège Business activé',
          'Le Stratège est prêt à travailler sur la clarification de l''idée.');

  insert into public.activity_events (workspace_id, agent_id, owner_id, event_type, title, description)
  values (v_workspace, v_designer, v_user_id, 'agent_created', 'Designer UX activé', null);

  insert into public.activity_events (workspace_id, agent_id, owner_id, event_type, title, description)
  values (v_workspace, v_growth, v_user_id, 'agent_created', 'Growth Marketer activé', null);

  insert into public.activity_events (workspace_id, agent_id, mission_id, owner_id, event_type, title, description)
  values (v_workspace, v_strategist, v_mission_1, v_user_id, 'mission_started',
          'Mission "Clarifier l''idée business" lancée',
          'Le Stratège analyse les hypothèses et prépare un brief.');

  insert into public.activity_events (workspace_id, agent_id, mission_id, owner_id, event_type, title, description)
  values (v_workspace, v_growth, v_mission_3, v_user_id, 'mission_started',
          'Mission "Première campagne d''acquisition" lancée',
          'Le Growth Marketer prépare 2 canaux à tester cette semaine.');
end $$;
