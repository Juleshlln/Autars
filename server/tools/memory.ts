// =====================================================================
// Memory tools — agent-facing search over agent_memories (pgvector RAG)
// =====================================================================
// Thin zod-validated wrapper around server/memory.ts so the tool surface
// matches the shape of all other agent tools (zod input schema, never-
// throws result envelope).
// =====================================================================

import { z } from 'zod'
import { searchMemory } from '../memory'

export const SearchMemoryInputSchema = z.object({
  query: z.string().min(2).max(500),
  match_threshold: z.number().min(0).max(1).optional(),
  match_count: z.number().int().min(1).max(15).optional(),
})
export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>

export interface SearchMemoryToolOk {
  ok: true
  query: string
  matches: Array<{
    content: string
    similarity: number
    source_mission_id: string | null
    source_deliverable_id: string | null
    created_at: string
  }>
}
export interface SearchMemoryToolErr {
  ok: false
  query: string
  error: string
}
export type SearchMemoryToolResult = SearchMemoryToolOk | SearchMemoryToolErr

export async function searchMemoryTool(
  workspaceId: string,
  input: SearchMemoryInput,
): Promise<SearchMemoryToolResult> {
  const parsed = SearchMemoryInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, query: String(input?.query ?? ''), error: parsed.error.message }
  }
  const res = await searchMemory({
    workspaceId,
    query: parsed.data.query,
    matchThreshold: parsed.data.match_threshold,
    matchCount: parsed.data.match_count,
  })
  if (!res.ok) {
    return { ok: false, query: parsed.data.query, error: res.skipped_reason ?? 'unknown_error' }
  }
  return {
    ok: true,
    query: res.query,
    matches: res.matches.map((m) => ({
      content: m.content,
      similarity: m.similarity,
      source_mission_id: m.source_mission_id,
      source_deliverable_id: m.source_deliverable_id,
      created_at: m.created_at,
    })),
  }
}
