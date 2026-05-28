-- =====================================================================
-- Autars - pgvector long-term agent memory + RAG search
-- =====================================================================
-- Adds:
--   * pgvector extension
--   * agent_memories table : id, workspace_id (= "venture"), content,
--     embedding (1536-d vector matching OpenAI text-embedding-3-small),
--     plus minimal metadata for source attribution & RLS.
--   * IVFFlat cosine index for sub-100ms similarity search.
--   * match_memories(query_embedding, workspace_id, threshold, limit) RPC
--     for the search_memory agent tool.
--
-- IMPORTANT: this is a NEW table (`agent_memories`, plural) and does NOT
-- replace the existing `agent_memory` (singular) created in 006. The two
-- coexist on purpose:
--   - agent_memory  : short, typed beliefs (fact, preference, constraint…)
--     written by the LLM in its metadata block. Pulled in full into every
--     prompt.
--   - agent_memories: arbitrary raw chunks (full deliverable markdown, web
--     scrape excerpts, …) retrieved by RAG when topically relevant.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

create extension if not exists vector;
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- agent_memories
-- ---------------------------------------------------------------------
create table if not exists public.agent_memories (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  -- "venture" in the product vocabulary == workspace in the DB schema.
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  agent_id              uuid references public.agents(id) on delete set null,
  source_mission_id     uuid references public.missions(id) on delete set null,
  source_deliverable_id uuid references public.deliverables(id) on delete set null,
  content               text not null,
  -- OpenAI text-embedding-3-small returns 1536-d float32 vectors. If we
  -- later swap to a model with a different dimension, drop+recreate the
  -- column (re-embedding is the only safe path).
  embedding             vector(1536),
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists agent_memories_workspace_idx
  on public.agent_memories(workspace_id, created_at desc);
create index if not exists agent_memories_owner_idx
  on public.agent_memories(owner_id);

-- IVFFlat works well past a few thousand rows. `lists=100` is a good
-- default for up to ~1M vectors. Use cosine distance to match the way
-- OpenAI/text-embedding-3 vectors are normalised.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'agent_memories_embedding_idx'
  ) then
    execute
      'create index agent_memories_embedding_idx
         on public.agent_memories
         using ivfflat (embedding vector_cosine_ops)
         with (lists = 100)';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- match_memories(query, workspace_id, threshold, k)
-- Returns the top-k memories whose cosine similarity to the query
-- vector >= threshold, scoped to a workspace.
-- ---------------------------------------------------------------------
create or replace function public.match_memories(
  p_query_embedding vector(1536),
  p_workspace_id    uuid,
  p_match_threshold float default 0.7,
  p_match_count     int default 5
)
returns table (
  id                    uuid,
  content               text,
  similarity            float,
  source_mission_id     uuid,
  source_deliverable_id uuid,
  created_at            timestamptz,
  metadata              jsonb
)
language sql stable as $$
  select
    m.id,
    m.content,
    1 - (m.embedding <=> p_query_embedding) as similarity,
    m.source_mission_id,
    m.source_deliverable_id,
    m.created_at,
    m.metadata
  from public.agent_memories m
  where m.workspace_id = p_workspace_id
    and m.embedding is not null
    and 1 - (m.embedding <=> p_query_embedding) >= p_match_threshold
  order by m.embedding <=> p_query_embedding asc
  limit greatest(p_match_count, 1);
$$;

-- ---------------------------------------------------------------------
-- RLS — users read their own memories only; writes go through the
-- service-role client on the server.
-- ---------------------------------------------------------------------
alter table public.agent_memories enable row level security;

drop policy if exists agent_memories_select_own on public.agent_memories;
create policy agent_memories_select_own on public.agent_memories
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists agent_memories_no_client_writes on public.agent_memories;
create policy agent_memories_no_client_writes on public.agent_memories
  for all to authenticated
  using (false)
  with check (false);
