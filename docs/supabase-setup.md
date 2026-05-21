# Supabase setup — Autars MVP

Ce guide explique comment connecter Autars à un vrai backend Supabase.
Sans configuration Supabase, l'app continue de fonctionner en mode local
(`localStorage`) et affiche un bandeau d'information en bas de page.

## 1. Créer un projet Supabase

1. Se connecter à <https://supabase.com> et créer un nouveau projet
   (région la plus proche, mot de passe DB conservé en lieu sûr).
2. Attendre la fin du provisioning (~1 min).
3. Dans **Project Settings → API**, récupérer :
   - `Project URL` → ira dans `VITE_SUPABASE_URL`
   - `anon` `public` key → ira dans `VITE_SUPABASE_ANON_KEY`

> ⚠️ Ne jamais exposer la `service_role` key côté frontend.

## 2. Variables d'environnement

Copier le fichier `.env.example` :

```bash
cp .env.example .env.local
```

Renseigner :

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
ANTHROPIC_API_KEY=sk-ant-...   # facultatif si pas d'agents LLM
```

Redémarrer `npm run dev` pour que Vite recharge les variables.

## 3. Lancer la migration

Le schéma initial est dans `supabase/migrations/001_init_autars_mvp.sql`.
Deux options pour l'exécuter :

### Option A — Dashboard Supabase (sans CLI)

1. Ouvrir **SQL Editor** dans le dashboard.
2. Coller le contenu de `supabase/migrations/001_init_autars_mvp.sql`.
3. Cliquer **Run**.

### Option B — Supabase CLI

```bash
# une seule fois
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# pousser la migration
supabase db push
```

Vérifier dans **Database → Tables** que les 5 tables sont créées :
`profiles`, `workspaces`, `agents`, `missions`, `activity_events`.
Vérifier dans **Authentication → Policies** que RLS est `enabled` sur
toutes les tables.

## 4. Créer un utilisateur de test

1. **Authentication → Users → Add user → "Create new user"**.
2. Email + mot de passe (≥ 6 caractères).
3. Cocher **"Auto-confirm email"** pour éviter le mail de validation.
4. Copier l'`UUID` de l'utilisateur (colonne `id`).

> Le trigger `on_auth_user_created` crée automatiquement un profil dans
> `public.profiles` pour cet utilisateur.

## 5. (Optionnel) Charger des seed data

Le fichier `supabase/seed.sql` insère 1 QG, 4 agents, 6 missions et
quelques évènements d'activité pour avoir un dashboard "vivant" dès la
première connexion.

1. Ouvrir `supabase/seed.sql`.
2. Remplacer `YOUR_USER_ID_HERE` par l'UUID copié à l'étape 4.
3. Coller dans le **SQL Editor** du dashboard et exécuter.

> Pour repartir de zéro : supprimer les lignes via le dashboard ou
> exécuter `truncate public.activity_events, public.missions,
> public.agents, public.workspaces restart identity cascade;`.

## 6. Tester depuis l'app

```bash
npm install   # une seule fois
npm run dev
```

1. Ouvrir <http://localhost:5173>.
2. Le bandeau bleu "Mode local" doit **avoir disparu** (signe que les
   variables sont bien chargées).
3. Cliquer **Se connecter** et utiliser l'email/mot de passe créés à
   l'étape 4.
4. Le dashboard doit afficher le QG, les agents et les missions issus
   de la table Supabase (et non les données locales).
5. Une nouvelle section "Activité live" apparaît dans la colonne de
   droite et est alimentée en temps réel par `activity_events`.
6. Cliquer **Lancer une mission** → la mission est créée dans
   Supabase, l'agent passe en `working`, et un évènement
   `mission_created` est inséré dans le feed.

## 7. Limites connues du MVP

- Le formulaire d'onboarding stocke `projectType` / `mainGoal` en
  JSON dans `workspaces.description` (cf. `mappers.ts`). À déplacer
  vers des colonnes dédiées quand le besoin est confirmé.
- Le statut UI agent (`actif` / `en attente` / `travaille`) est mappé
  vers le statut DB (`idle` / `working` / `blocked` / `done`) — voir
  `src/services/mappers.ts` si vous changez les libellés UI.
- Le ticker local qui anime la `progress` des missions est conservé
  pour l'UX ; la `progress` n'est pas persistée côté DB pour le MVP.
- Realtime activité : utilise `supabase.channel` en INSERT. Activer
  Realtime sur la table `activity_events` dans
  **Database → Replication** si non actif par défaut.

## 8. Régénérer les types TypeScript (optionnel)

Quand le schéma évolue, on peut remplacer `src/lib/database.types.ts`
par les types générés automatiquement :

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```
