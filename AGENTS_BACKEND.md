# AGENTS_BACKEND — comment fonctionne la boucle agents d'Autars

Ce document explique la boucle **QG → agents → missions → livrables**, les
tables impliquées, et comment débugger une mission bloquée.

> Vocabulaire : dans le code/DB, un **QG** = une `workspace`, un **mission_run**
> = un `agent_run`, un **wallet** = `credit_wallets`, les **events** =
> `activity_events`. L'UI parle de « QG / filiale » ; la base parle de
> « workspace ». C'est la même chose.

---

## 1. Vue d'ensemble

```
Utilisateur (navigateur)
        │  src/v1/AutarsApp.tsx → src/v1/useAutarsBackend.ts
        │  src/services/*  (client Supabase anon + fetch /api/agents/*)
        ▼
Middleware Vite (server-side, vite.config.ts → server/agent-handlers.ts)
        │  service-role Supabase (server/supabaseAdmin.ts)
        │  LLM vendor-agnostique (server/llmClient.ts)
        ▼
Supabase Postgres (RLS + RPC transactionnels)
```

- **Le front ne décide jamais de l'état métier.** Il affiche ce que la base
  contient et réagit au temps réel (`postgres_changes`).
- **Tout passe par le serveur** pour les écritures sensibles (crédits, runs,
  livrables, XP). Les clés IA et la service-role ne touchent jamais le browser.
- Si Supabase n'est pas configuré (`VITE_SUPABASE_URL` absent), l'app bascule
  en **mode local** (démo offline, données en `localStorage`). Ce mode est un
  fallback explicite, pas la source de vérité.

---

## 2. Tables utilisées

| Table | Rôle |
|-------|------|
| `profiles` | profil utilisateur (1:1 `auth.users`) |
| `workspaces` | le QG : nom, idée, stade, niveau, xp |
| `workspace_context` | contexte business structuré (idée, cible, marché, contraintes…) injecté dans les prompts |
| `agents` | agents du QG : rôle, spécialité, statut, niveau, xp |
| `missions` | missions : titre, `type`, statut, coût crédits, récompense XP |
| `agent_runs` | une exécution de mission (queued → running → completed/failed) |
| `deliverables` | livrables produits, versionnés, avec statut de validation |
| `decisions` | trace des décisions utilisateur (validé / à améliorer / rejeté) |
| `credit_wallets` / `credit_transactions` | solde + journal des crédits |
| `activity_events` | flux d'activité temps réel (tout est loggé ici) |
| `agent_memory` | mémoire court terme (faits, contraintes) injectée dans les prompts |
| `agent_memories` | mémoire long terme **pgvector** (RAG, best-effort) |
| `mission_steps` / `tool_calls` | trace fine des phases ReAct et des appels d'outils |
| `hq_metrics` | KPIs numériques observés par QG |

RLS : chaque table est `owner_id`-scoped en lecture. Les écritures passent par
la **service-role** côté serveur (qui bypasse la RLS) ou par des **RPC**
`security definer`.

---

## 3. Comment une mission est exécutée

Point d'entrée : `POST /api/agents/run { missionId }`
(`server/agent-handlers.ts` → `handleAgentRun`).

1. **Auth** : `Authorization: Bearer <access_token>` → `resolveUserId`.
2. **Garde double-lancement** : si la mission est déjà `in_progress` /
   `waiting_user_decision` / `completed`, renvoie `409` (idempotence minimale).
3. **Pré-vol** : `resolveAgentMission(type)` + `getLLMConfig()`. Si la clé IA
   manque, on renvoie `503 missing_ai_api_key` **avant** de débiter un crédit.
4. **Débit crédits** : RPC transactionnel `consume_credits`. Si solde
   insuffisant → `402` + event `credits_insufficient` (aucun crédit négatif
   possible).
5. **Création du run** : `agent_runs` en `queued` → `running` ; mission →
   `in_progress` ; agent → `working`. Events `run_queued` / `run_started`.
6. **Exécution LLM** : `runAgentMission(def, ctx, onProgress)`
   (`server/agents/runAgentMission.ts`) — boucle **plan → act → synthesize**.
   Chaque phase émet un `activity_event` `agent_thinking` (streaming UI).
7. **Normalisation du résultat** (3 couches) :
   - échec dur (exception LLM) → `failed` + **remboursement** + event
     `run_failed` ;
   - sortie vide/récupérable → **livrable fallback** structuré (le crédit
     reste débité car l'agent a tourné), flag `used_fallback` ;
   - garde de validation tardive (`validateMissionResult`).
8. **Livrable** : insert dans `deliverables` (version = max+1), statut
   `pending_validation`. Mise à jour `workspace_context` + `agent_memory` +
   indexation RAG (best-effort).
9. **Clôture** : run → `waiting_user_decision`, mission →
   `waiting_user_decision` (avec `current_deliverable_id`), agent → `done`.
   Events `run_completed` + `deliverable_created`.

Le front reçoit tout via les canaux temps réel (`missions`, `deliverables`,
`activity_events`, `credit_wallets`, `agents`) — voir `useAutarsBackend.ts`.

### Quel prompt pour quelle mission ?

`resolveAgentMission(missionType)` (`server/agents/index.ts`) mappe le `type`
de la mission vers une `AgentMissionDefinition` :

- `clarify-business-idea` → JSON structuré (`server/agents/strategist.ts`)
- `scan` → rapport Markdown avec outils web (`strategist.ts`)
- `segment`, `value-prop`, `positioning`, `business-model`, `offer`, `landing`,
  `roadmap`, `brand-kit`, `acquisition`, `content-plan`, `pricing` → Markdown
  dédié (`server/agents/markdownMissions.ts`)
- type inconnu / alias → fallback `clarify-business-idea`.

**Pour ajouter une mission** : ajoute le type à `AgentMissionType`
(`types.ts`) + au zod enum (`schemas.ts`), crée la définition dans
`markdownMissions.ts`, ajoute-la au registre `index.ts`. C'est tout — le runner,
la persistance et l'UI sont génériques.

---

## 4. Comment un livrable est généré

`runAgentMission` produit un `AgentExecutionResult` :

- `outputFormat` : `json` (clarify) ou `markdown` (tout le reste).
- `content` : le markdown ou le JSON sérialisé (rendu à l'utilisateur).
- `structured` : objet structuré persisté dans `deliverables.structured_content`.
- `recommendedNextMissions` : extraites du bloc `<!--AUTARS_METADATA:{…}-->`
  que le runner ajoute automatiquement aux prompts markdown.
- `summary`, `contextUpdates`, `memoryItems`.

L'utilisateur peut alors, depuis l'UI :

- **Valider** → `POST /api/agents/decide {decision:'validated'}` → mission
  `completed`, XP attribué.
- **Demander une amélioration** → `POST /api/agents/iterate {feedback}` →
  nouvelle version (v+1), sans re-débit de crédit.
- **Rejeter** → `decision:'rejected'`.
- **Convertir une reco en mission** → `POST /api/agents/next`.

---

## 5. Comment l'XP est attribué

- **XP agent** : à la **validation** d'un livrable, `handleAgentDecide` appelle
  la RPC `award_mission_xp(user, agent, xp)` (idempotent via `missions.xp_awarded`).
  La RPC met à jour `agents.xp` et recalcule le niveau ; un dépassement émet un
  event `agent_leveled_up`.
- **Niveaux** : formule progressive centralisée côté DB (RPC `award_mission_xp`).
- L'XP n'est pas qu'un badge visuel : il est persisté et conditionne le niveau
  (et, à terme, le déblocage de missions/skins).

> Note V1 : l'XP **QG** (workspace) est prévu par le schéma (`workspaces.xp`,
> `workspaces.level`) mais l'attribution automatique côté run reste à câbler —
> voir PRODUCTION_CHECKLIST « points non terminés ».

---

## 6. Débugger une mission bloquée

Une mission ne doit **jamais** rester en `in_progress` sans trace. Si ça arrive :

1. **Regarde `activity_events`** du workspace (triés par `created_at`) : la
   séquence `run_queued → run_started → agent_thinking… → run_completed`/
   `run_failed` raconte exactement où ça s'est arrêté.
2. **Regarde `agent_runs`** de la mission : `status`, `error_message`, `model`.
   Un run en `failed` porte le code d'erreur (ex. `llm_call_failed:…`,
   `empty_completion`, `deliverable_insert_failed:…`).
3. **Regarde `missions.result`** : `{ error, friendly_error }` en cas d'échec.
4. **Logs serveur** : `[mission.run.failed]`, `[mission.run.empty]`,
   `[refund_credits.*]` (structurés, sans secret).

Causes fréquentes et garde-fous déjà en place :

| Symptôme | Cause | Garde-fou |
|----------|-------|-----------|
| `503 missing_ai_api_key` | `LLM_API_KEY`/`ANTHROPIC_API_KEY` absent | refus **avant** débit crédit |
| `402` | crédits insuffisants | event `credits_insufficient`, pas de solde négatif |
| run `failed` + crédit rendu | exception LLM / insert KO | `markRunFailed` + `refund_credits` (idempotent) |
| livrable « version fallback » | sortie LLM vide/instable | `generateMissionFallback` (le crédit reste, l'agent a tourné) |
| mission `in_progress` figée | (ne devrait pas arriver) | tout chemin d'erreur flippe run+mission+agent en terminal |

Pour **relancer** une mission échouée : elle repasse `failed` → l'UI propose de
relancer (`runMission`), ce qui crée un nouveau run.
