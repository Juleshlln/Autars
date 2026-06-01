# AUDIT — Backend agents IA d'Autars

> Diagnostic technique de la branche `gamification-full` (audit réalisé sur
> `claude/nifty-fermi-dCcpz`). Objectif : rendre la boucle
> **QG → agents → missions → livrables** fiable et prête pour la mise en ligne.

L'app réellement montée est `src/v1/AutarsApp.tsx` (via `src/main.tsx`),
branchée sur `src/v1/useAutarsBackend.ts`. Le backend agents tourne en
middleware Vite (`vite.config.ts` → `server/agent-handlers.ts`) avec un client
LLM vendor-agnostique (`server/llmClient.ts`) et un service-role Supabase
(`server/supabaseAdmin.ts`). Le projet Supabase connecté est **Autars**
(`qpdcnyvvuyyucpzgbotw`), déjà peuplé (11 workspaces, 44 agents, 48 missions,
10 runs, 3 livrables).

**Bonne nouvelle** : l'architecture backend est déjà solide (auth Bearer, RPC
de crédits transactionnels, cycle de vie des runs, livrables versionnés,
fallback sur sortie vide, remboursement idempotent, XP, events d'activité). Le
problème principal n'est pas l'absence de boucle — c'est que **la plupart des
missions produisent le mauvais livrable** et que **le repo et la base ont
divergé**.

---

## 1. Erreurs bloquantes

| # | Problème | Impact | Fichier |
|---|----------|--------|---------|
| B1 | **Registre d'agents incomplet** : seuls `clarify-business-idea` et `scan` sont enregistrés. Tous les autres types (`segment`, `value-prop`, `positioning`, `offer`, `landing`, `acquisition`, `brand-kit`) retombent sur le prompt *clarify-business-idea*. | 5 des 6 missions de départ produisent un **livrable générique** (clarification JSON) au lieu du livrable attendu. C'est le cœur du problème « livrables génériques sans rapport ». | `server/agents/index.ts` |
| B2 | **Agent Finance décoratif** : le seed crée un agent « Finance » mais **aucune mission** ne lui est rattachée. | Agent visible mais inutilisable → « agent purement décoratif ». | `src/services/workspacesService.ts` |
| B3 | **Type de mission non canonique** : le seed crée la 1ʳᵉ mission avec `type: 'clarify'` alors que le registre attend `clarify-business-idea`. Ça « marche » uniquement par chance via le fallback. | Fragile : tout changement du fallback casse la mission d'amorçage. | `src/services/workspacesService.ts` |

## 2. Erreurs backend agents IA

- **B1** (ci-dessus) est la plus grave : `resolveAgentMission()` ne couvre pas
  les types réellement émis par le seed et par `resolveMissionType()`
  (`src/v1/useAutarsBackend.ts`).
- Le `AgentMissionType` (TS) liste 9 types mais le registre n'en implémente
  que 2. Aucun type Finance (`pricing` / `business-model`) n'existe.
- `server/missions.ts` (config `scan`/`positioning`/`brand-kit` pour l'ancien
  flux chat brief/mission) **n'est plus sur le chemin critique** du runner
  agents → code mort / redondant à isoler.

## 3. Incohérences Supabase

- **Divergence migrations ↔ base (critique)** : l'historique de migrations de
  la base ne contient qu'**une** migration : `20260528221319_010_hq_runtime`.
  Or le repo ne contient que `001…009` — **`010_hq_runtime` est absent du
  repo**. À l'inverse, `001…009` ne sont pas tracées dans la base.
  → Un déploiement *from scratch* depuis le repo **ne reproduit pas** la base.
- Objets présents en base mais **absents des migrations du repo** (créés par le
  `010_hq_runtime` manquant) :
  - Tables : `mission_steps`, `tool_calls`, `hq_metrics`.
  - Colonnes : `missions.category`, `missions.required_level`,
    `missions.expected_output_type`, `missions.input_schema`,
    `workspaces.business_score`, `agents.current_mission_id`,
    `deliverables.html_content`, `deliverables.markdown_content`,
    `deliverables.quality_score`.
- **Redondance de tables mémoire** : `agent_memory` (texte) **et**
  `agent_memories` (pgvector) coexistent. Les deux sont utilisées
  (court terme vs RAG) — à documenter, pas forcément à fusionner.
- **Doublons internes** : `005_repair_backend_schema.sql` redéfinit
  `award_mission_xp` deux fois et recrée des tables déjà créées en 001/002
  (idempotent mais bruyant).

## 4. Composants encore mockés

- `src/services/missionSimulation.ts` — `setTimeout` simulant une complétion de
  mission. **Importé nulle part → code mort.** À supprimer.
- `src/v1/useAutarsBackend.ts` (l.184-195) — *progress ticker* `setInterval`
  qui pousse la barre de progression jusqu'à 92 %. Tourne **dans tous les
  modes**, y compris Supabase où il entre en concurrence avec le temps réel.
  → À restreindre au mode `local`.
- `src/game/store.ts` — store Pixi avec scripts `setTimeout` : **couche
  d'animation** réellement utilisée par `AutarsApp` (via `useGame`). À
  **conserver** (animation, pas source de vérité métier).
- Code legacy non monté : `src/screens.tsx`, `src/components.tsx`, `src/App.tsx`,
  `src/state.ts`, `src/data.ts`, `src/hq/*` — non atteignables depuis `main.tsx`.
  À isoler/supprimer plus tard (hors chemin critique, suppression risquée tant
  que le build n'est pas re-vérifié).

## 5. Appels IA absents ou mal structurés

- Les appels IA réels existent et sont **corrects** (`server/agents/runAgentMission.ts`,
  boucle plan → act → synthesize, sortie validée par zod, jamais de throw au
  travers de la frontière).
- Le **manque** n'est pas l'appel mais le **prompt système par type de
  mission** : 7 types n'ont aucune définition dédiée (cf. B1).
- Les clés IA sont **côté serveur uniquement** (middleware Vite), jamais
  exposées au navigateur. ✅

## 6. Risques de sécurité

- ✅ Toutes les tables ont la RLS activée (vérifié via `list_tables`).
- ✅ Les écritures sensibles (crédits, runs, livrables) passent par le
  **service-role côté serveur** (`server/supabaseAdmin.ts`), jamais le client.
- ✅ `.env.example` documente bien le découpage clés publiques / secrètes.
- ⚠️ La RLS des 3 tables manquantes (`mission_steps`, `tool_calls`,
  `hq_metrics`) doit être versionnée dans la migration 010 du repo (sinon un
  fresh deploy crée des tables non protégées). Traité par la migration ajoutée.
- ⚠️ À vérifier avant prod : RLS appliquée par `get_advisors` (non re-testé
  pendant cet audit car le connecteur MCP Supabase était instable).

## 7. Fichiers à modifier

| Priorité | Fichier | Action |
|----------|---------|--------|
| P0 | `server/agents/markdownMissions.ts` *(nouveau)* | Définitions de mission par rôle (segment, value-prop, positioning, offer, landing, acquisition, brand-kit, pricing, business-model). |
| P0 | `server/agents/index.ts` | Enregistrer tous les types + alias `clarify`. |
| P0 | `server/agents/types.ts` / `schemas.ts` | Ajouter `pricing`, `business-model` au type + au zod enum. |
| P0 | `src/services/workspacesService.ts` | Type canonique `clarify-business-idea` + ajouter une mission Finance. |
| P1 | `supabase/migrations/010_hq_runtime.sql` *(nouveau)* | Recapturer le schéma manquant (idempotent, RLS incluse). |
| P1 | `src/services/missionSimulation.ts` | Supprimer (mort). |
| P1 | `src/v1/useAutarsBackend.ts` | Restreindre le ticker au mode local. |
| P2 | `src/services/mappers.ts` | Mapper les statuts agents `thinking`/`waiting_validation`. |

## 8. Ordre de correction recommandé

1. **Registre d'agents** (B1) — débloque de vrais livrables pour chaque mission.
2. **Seed** (B2/B3) — type canonique + mission Finance (plus d'agent décoratif).
3. **Migration `010_hq_runtime`** — réaligner repo ↔ base pour un fresh deploy.
4. **Nettoyage mocks** — supprimer `missionSimulation.ts`, restreindre le ticker.
5. **Robustesse mappers** — statuts agents complets.
6. **Vérification** — `npm install && npm run lint && npm run build`.
7. **Doc** — `AGENTS_BACKEND.md`, `PRODUCTION_CHECKLIST.md`.

> Principe directeur (rappelé par le brief) : **une V1 simple qui marche**
> plutôt qu'un système ambitieux instable. On ne refait pas l'UI ; on fiabilise
> la boucle agents → missions → livrables.
