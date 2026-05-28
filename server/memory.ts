// =====================================================================
// Long-term agent memory — embed + insert + RAG search
// =====================================================================
// Every validated/produced deliverable is chunked, embedded with OpenAI
// text-embedding-3-small (1536-d), and inserted into agent_memories.
// Agents can then call the `search_memory` tool to recall topically
// relevant past work without us having to stuff every prior deliverable
// into the prompt.
//
// The embedding API is intentionally separate from the chat LLM API: the
// main LLM might be Claude (no embeddings), so embeddings need their own
// OpenAI key (OPENAI_EMBED_API_KEY) with its own optional base URL.
// If neither is configured we silently no-op rather than crashing the
// mission — the rest of the agent still works.
// =====================================================================

import OpenAI from 'openai'
import { admin, hasAdmin } from './supabaseAdmin'

const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_DIM = 1536
const MAX_CHUNK_CHARS = 4_000 // ~1k tokens — safely under model max
const MAX_CHUNKS_PER_INDEX = 6 // hard cap on what we store per deliverable

let _embedClient: OpenAI | null = null

function embedConfig(): {
  apiKey: string | null
  baseURL: string | null
} {
  const apiKey =
    process.env.OPENAI_EMBED_API_KEY ?? process.env.OPENAI_API_KEY ?? null
  const baseURL = process.env.OPENAI_EMBED_BASE_URL ?? null
  return { apiKey, baseURL }
}

function getEmbedClient(): OpenAI | null {
  if (_embedClient) return _embedClient
  const cfg = embedConfig()
  if (!cfg.apiKey) return null
  _embedClient = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL ?? undefined,
  })
  return _embedClient
}

export function hasEmbeddings(): boolean {
  return Boolean(embedConfig().apiKey)
}

// ---------------------------------------------------------------------
// Chunking — simple char-window with paragraph-boundary preference
// ---------------------------------------------------------------------
function chunkText(input: string): string[] {
  const cleaned = input.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  if (cleaned.length <= MAX_CHUNK_CHARS) return [cleaned]
  const chunks: string[] = []
  let cursor = 0
  while (cursor < cleaned.length && chunks.length < MAX_CHUNKS_PER_INDEX) {
    const end = Math.min(cursor + MAX_CHUNK_CHARS, cleaned.length)
    // Try to cut on the last full sentence to keep chunks self-contained.
    let cutAt = end
    if (end < cleaned.length) {
      const window = cleaned.slice(cursor, end)
      const lastPeriod = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
      )
      if (lastPeriod > MAX_CHUNK_CHARS * 0.5) {
        cutAt = cursor + lastPeriod + 1
      }
    }
    chunks.push(cleaned.slice(cursor, cutAt).trim())
    cursor = cutAt
  }
  return chunks
}

// ---------------------------------------------------------------------
// embedTexts — batched, never throws
// ---------------------------------------------------------------------
async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const client = getEmbedClient()
  if (!client || texts.length === 0) return null
  try {
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: texts,
    })
    const vectors = res.data
      .map((d) => (Array.isArray(d.embedding) ? (d.embedding as number[]) : null))
      .filter((v): v is number[] => Array.isArray(v) && v.length === EMBED_DIM)
    return vectors.length === texts.length ? vectors : null
  } catch (err) {
    console.warn(
      '[memory.embedTexts] failed:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

// pgvector wire format for parametric inserts: a string like "[0.1,0.2,...]"
function vectorToParam(v: number[]): string {
  return '[' + v.map((n) => (Number.isFinite(n) ? n : 0)).join(',') + ']'
}

// ---------------------------------------------------------------------
// indexDeliverable — store a deliverable as searchable memory chunks
// ---------------------------------------------------------------------
export interface IndexDeliverableParams {
  ownerId: string
  workspaceId: string
  agentId: string | null
  missionId: string
  deliverableId: string
  title: string
  content: string
}

export interface IndexDeliverableResult {
  ok: boolean
  inserted: number
  skipped_reason?: string
}

export async function indexDeliverable(
  params: IndexDeliverableParams,
): Promise<IndexDeliverableResult> {
  if (!hasAdmin()) return { ok: false, inserted: 0, skipped_reason: 'no_admin' }
  if (!hasEmbeddings())
    return { ok: false, inserted: 0, skipped_reason: 'no_embed_key' }

  const chunks = chunkText(`${params.title}\n\n${params.content}`)
  if (chunks.length === 0)
    return { ok: false, inserted: 0, skipped_reason: 'empty_content' }

  const vectors = await embedTexts(chunks)
  if (!vectors)
    return { ok: false, inserted: 0, skipped_reason: 'embed_failed' }

  const sb = admin()
  const rows = chunks.map((content, i) => ({
    owner_id: params.ownerId,
    workspace_id: params.workspaceId,
    agent_id: params.agentId,
    source_mission_id: params.missionId,
    source_deliverable_id: params.deliverableId,
    content,
    embedding: vectorToParam(vectors[i]),
    metadata: { title: params.title, chunk_index: i, chunk_count: chunks.length },
  }))

  try {
    const { error } = await sb.from('agent_memories').insert(rows)
    if (error) {
      console.warn('[memory.indexDeliverable] insert error:', error.message)
      return { ok: false, inserted: 0, skipped_reason: `insert_failed: ${error.message}` }
    }
    return { ok: true, inserted: rows.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[memory.indexDeliverable] insert threw:', msg)
    return { ok: false, inserted: 0, skipped_reason: `insert_threw: ${msg}` }
  }
}

// ---------------------------------------------------------------------
// searchMemory — RAG lookup used by the `search_memory` agent tool
// ---------------------------------------------------------------------
export interface SearchMemoryParams {
  workspaceId: string
  query: string
  matchThreshold?: number
  matchCount?: number
}

export interface MemoryMatch {
  id: string
  content: string
  similarity: number
  source_mission_id: string | null
  source_deliverable_id: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export interface SearchMemoryResult {
  ok: boolean
  query: string
  matches: MemoryMatch[]
  skipped_reason?: string
}

export async function searchMemory(
  params: SearchMemoryParams,
): Promise<SearchMemoryResult> {
  const query = params.query.trim()
  if (!query) return { ok: false, query: '', matches: [], skipped_reason: 'empty_query' }
  if (!hasAdmin())
    return { ok: false, query, matches: [], skipped_reason: 'no_admin' }
  if (!hasEmbeddings())
    return { ok: false, query, matches: [], skipped_reason: 'no_embed_key' }

  const vectors = await embedTexts([query])
  if (!vectors || vectors.length === 0)
    return { ok: false, query, matches: [], skipped_reason: 'embed_failed' }

  const sb = admin()
  try {
    const { data, error } = await sb.rpc('match_memories', {
      p_query_embedding: vectorToParam(vectors[0]),
      p_workspace_id: params.workspaceId,
      p_match_threshold: params.matchThreshold ?? 0.7,
      p_match_count: params.matchCount ?? 5,
    })
    if (error) {
      console.warn('[memory.searchMemory] rpc error:', error.message)
      return {
        ok: false,
        query,
        matches: [],
        skipped_reason: `rpc_failed: ${error.message}`,
      }
    }
    const matches = Array.isArray(data)
      ? (data as MemoryMatch[]).map((m) => ({
          id: String(m.id),
          content: String(m.content),
          similarity: Number(m.similarity ?? 0),
          source_mission_id: m.source_mission_id ?? null,
          source_deliverable_id: m.source_deliverable_id ?? null,
          created_at: String(m.created_at),
          metadata: (m.metadata as Record<string, unknown>) ?? {},
        }))
      : []
    return { ok: true, query, matches }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, query, matches: [], skipped_reason: `rpc_threw: ${msg}` }
  }
}
