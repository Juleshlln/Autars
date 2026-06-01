# PRODUCTION_CHECKLIST — Autars

Checklist de mise en ligne. Coché = vérifié pendant l'audit
`claude/nifty-fermi-dCcpz`. À cocher = à faire/valider avant prod.

---

## 1. Variables d'environnement

Voir `.env.example` (complet et commenté). Découpage **public vs secret** :

| Variable | Côté | Obligatoire | Note |
|----------|------|-------------|------|
| `VITE_SUPABASE_URL` | client | ✅ | sans ça → mode local (démo) |
| `VITE_SUPABASE_ANON_KEY` | client | ✅ | clé `anon public` uniquement |
| `SUPABASE_URL` | serveur | ✅ | runner agents |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | ✅ | **jamais** préfixé `VITE_` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | serveur | ✅ | endpoint OpenAI-compatible (Claude/GPT/Ollama) |
| `ANTHROPIC_API_KEY` | serveur | ⛳ fallback | si `LLM_API_KEY` absent |
| `OPENAI_EMBED_API_KEY` | serveur | optionnel | RAG mémoire (no-op si absent) |
| `MAKE_WEBHOOK_URL`, `BREVO_API_KEY`, `VERCEL_TOKEN` | serveur | optionnel | outils d'action des agents |
| `STRIPE_WEBHOOK_SECRET` | serveur | optionnel | recharge crédits |

- [ ] Aucune clé secrète n'est exposée au client (vérifier qu'aucun secret n'a
      de préfixe `VITE_`). ✅ vérifié dans le code (clés lues seulement dans
      `server/*`).

> ⚠️ **Architecture de déploiement** : le backend agents tourne aujourd'hui en
> **middleware Vite** (`vite.config.ts`). En `vite preview`/build statique pur,
> `/api/agents/*` n'existe pas. Pour la prod, héberger derrière un serveur Node
> qui exécute ce middleware **ou** porter `server/*` en Supabase Edge Functions /
> route API. **C'est le principal point à trancher avant mise en ligne.**

## 2. Migrations Supabase

- [x] `supabase/migrations/001…011` présentes et **ordonnées**.
- [x] `010_hq_runtime.sql` recapturé (était appliqué en prod mais absent du repo).
- [x] `011_hq_xp.sql` ajouté (RPC `award_hq_xp` — XP du QG, à appliquer en prod).
- [x] Toutes les RPC utilisées par le backend existent dans les migrations :
      `consume_credits`, `refund_credits`, `award_mission_xp`, `award_hq_xp`,
      `create_mission_from_recommendation`, `match_memories`,
      `grant_initial_credits`, `handle_new_user`, `handle_new_workspace`.
- [ ] **Fresh deploy** : sur une base neuve, `supabase db push` applique
      001→010 sans erreur (les migrations sont idempotentes). À tester sur un
      projet jetable avant prod.
- [ ] **Base existante** (`qpdcnyvvuyyucpzgbotw`) : déjà alignée — `010_hq_runtime`
      est dans l'historique ; ré-appliquer le repo serait un no-op idempotent.
      L'historique ne trace pas 001→009 (appliquées hors `supabase migration`) ;
      pas bloquant car idempotent, mais à régulariser avec `supabase migration repair`.

## 3. Build & qualité

- [x] `npm install` — OK (192 paquets, 0 vuln).
- [x] `npm run lint` — **clean** (5 erreurs préexistantes corrigées).
- [x] `npm run build` (`tsc -b && vite build`) — **success**.
- [ ] Warning non bloquant : chunk JS > 500 kB (pixi.js). Code-splitting
      possible plus tard ; pas un blocage prod.

## 4. Sécurité / RLS

- [x] RLS activée sur toutes les tables `public` (vérifié via `list_tables`).
- [x] Écritures sensibles via service-role serveur uniquement.
- [x] RLS owner-scoped versionnée pour les 3 tables recapturées
      (`mission_steps`, `tool_calls`, `hq_metrics`) dans `010`.
- [ ] Lancer `get_advisors` (security + performance) sur le projet et traiter
      les éventuels avertissements (non re-testé : connecteur MCP instable
      pendant l'audit).

## 5. Tests manuels (à exécuter avec une clé LLM réelle configurée)

> Non exécutés pendant l'audit (nécessitent une clé LLM active + des écritures
> DB ; l'environnement MCP était instable). Procédure prête à dérouler :

**Scénario A — Nouveau compte (happy path)**
- [ ] Créer un utilisateur, créer un QG avec une idée business simple.
- [ ] Vérifier : 4 agents + 11 missions de départ créés.
- [ ] Lancer « Clarifier l'idée business » → `agent_run` créé, mission
      `in_progress`, agent `working`, appel LLM réel.
- [ ] Livrable sauvegardé, mission `waiting_user_decision`.
- [ ] Valider → mission `completed`, agent reçoit de l'XP.
- [ ] Lancer « Définir le pricing » (Finance) → vérifier que le livrable est
      **un pricing**, pas une clarification générique (c'était le bug corrigé).
- [ ] Refresh → livrable toujours présent (rien en localStorage).

**Scénario B — Erreur IA**
- [ ] Retirer/invalider la clé LLM, lancer une mission.
- [ ] Vérifier `503 missing_ai_api_key` **sans** débit, OU run `failed` +
      `error_message` + crédit remboursé. Aucune mission figée en `in_progress`.
- [ ] L'utilisateur voit un message compréhensible.

**Scénario C — Crédits insuffisants**
- [ ] Mettre le wallet à 0, lancer une mission payante.
- [ ] Vérifier `402`, event `credits_insufficient`, aucun solde négatif, message clair.

## 6. Points non terminés (V1)

- [x] **XP QG** : attribué via `award_hq_xp` à la validation (migration `011`),
      persisté dans `workspaces.xp/level`, event `hq_leveled_up` dans le flux.
  - [ ] Reste : appliquer la migration `011` en prod + brancher l'affichage du
        niveau QG (panneau gamifié) sur `workspaces.xp/level` plutôt que sur
        l'XP local de `src/v1/gamification`.
- [ ] **Déploiement `/api/agents/*`** hors middleware Vite (cf. §1).
- [ ] **Régulariser l'historique migrations** (`supabase migration repair`).
- [ ] **Tests manuels A/B/C** à dérouler avec clé LLM réelle.
- [ ] `get_advisors` à repasser.

## 7. Risques connus

- **Redondance mémoire** : `agent_memory` (court terme) et `agent_memories`
  (RAG pgvector) coexistent — voulu, mais à documenter pour l'équipe.
- **Code legacy non monté** : `src/screens.tsx`, `src/components.tsx`,
  `src/App.tsx`, `src/hq/*`, `src/state.ts` ne sont pas atteints par `main.tsx`.
  Inoffensifs (le build les ignore via tree-shaking) mais à nettoyer pour
  réduire la confusion. **Attention** : `src/game/store.ts` EST utilisé par
  l'app (animation) — ne pas supprimer.
- **Outils web des agents** : `scan`/`positioning` utilisent des outils web ;
  l'endpoint Anthropic OpenAI-compat peut être instable sur des boucles d'outils
  multi-itérations (`maxToolIterations` plafonné). Les autres missions sont en
  génération déterministe sans outil (fiables).
- **Couplage front ↔ middleware Vite** pour les appels IA (cf. §1).
