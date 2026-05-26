# Fix Backend Supabase Errors

## Symptomes

- `GET /rest/v1/credit_wallets?...` retourne `404`.
- `GET /rest/v1/subscriptions?...` retourne `404`.
- `POST /rest/v1/missions?...` retourne `400`.
- La creation du QG affiche `Erreur backend -- Creation du QG impossible.`
- La requete `missions` contient des colonnes recentes comme `cost_credits`, `type`, `order_index` et `xp_reward`.

## Cause probable

Le frontend utilise le schema backend courant, mais la base Supabase reelle est restee sur un schema plus ancien ou partiellement migre. Les cas les plus probables sont :

- migrations `002`, `003` ou `004` non appliquees ;
- migration appliquee partiellement ;
- cache PostgREST pas recharge apres modification du schema.

## Reparation dans Supabase

1. Ouvrir le projet Supabase.
2. Aller dans SQL Editor.
3. Executer `supabase/migrations/005_repair_backend_schema.sql`.
4. Executer `supabase/diagnostics/check_backend_schema.sql`.
5. Verifier que les tables `plans`, `subscriptions`, `credit_wallets` et `credit_transactions` existent.
6. Verifier que `missions` contient `cost_credits`, `order_index`, `xp_reward`, `started_at`, `completed_at`, `xp_awarded` et `simulation_due_at`.
7. Verifier que `plans` contient 4 lignes : `free`, `starter`, `pro`, `business`.
8. Relancer explicitement `notify pgrst, 'reload schema';` si les erreurs REST persistent.
9. Redemarrer le serveur Vite avec `npm run dev`.
10. Creer un nouvel utilisateur test, puis completer l'onboarding.

## Requetes de verification

Tables attendues :

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'profiles',
  'workspaces',
  'agents',
  'missions',
  'activity_events',
  'plans',
  'subscriptions',
  'credit_wallets',
  'credit_transactions'
)
order by table_name;
```

Colonnes `missions` :

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
and table_name = 'missions'
order by ordinal_position;
```

Plans :

```sql
select *
from public.plans
order by monthly_credits;
```

Wallet utilisateur :

```sql
select user_id, balance, monthly_allowance, last_refill_at
from public.credit_wallets;
```

Subscription utilisateur :

```sql
select user_id, plan_id, status
from public.subscriptions;
```

Reload PostgREST :

```sql
notify pgrst, 'reload schema';
```

## Utilisateur deja existant

Si ton utilisateur test existait avant les tables de credits, le trigger `handle_new_user` n'a pas pu lui creer de subscription ou de wallet.

Dans ce cas :

1. Executer `supabase/diagnostics/backfill_existing_users.sql`.
2. Verifier que ton utilisateur a une subscription active `free`.
3. Verifier qu'il a un wallet.
4. Si le wallet existait deja, son solde est conserve.
5. Si le wallet etait absent, le script cree un wallet avec 4 credits et une transaction `initial_grant`.

## Erreurs restantes possibles

- RLS : si une requete retourne `401` ou `403`, verifier que l'utilisateur est bien connecte et que les lignes utilisent le bon `owner_id` ou `user_id`.
- Ancien utilisateur : executer le backfill si le compte a ete cree avant la migration.
- Cache PostgREST : relancer `notify pgrst, 'reload schema';`.
- Donnees partielles : si une migration ancienne a cree des doublons de subscriptions actives, corriger les doublons avant de recreer l'index unique `subscriptions_user_active_unique`.
