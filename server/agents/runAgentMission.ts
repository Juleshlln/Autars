// =====================================================================
// Agent orchestrator
// =====================================================================
// Single entry point used by HTTP handlers. Calls Anthropic with the
// resolved AgentMissionDefinition, parses JSON output strictly (with one
// retry), returns a normalized AgentExecutionResult.
//
// This module is server-side only. It must NOT be imported from /src.
// =====================================================================

import Anthropic from '@anthropic-ai/sdk'
import type {
  AgentMissionDefinition,
  AgentRunContext,
  ClarifyBusinessIdeaOutput,
  RecommendedNextMission,
  ScanReportOutput,
} from './types'

export interface AgentExecutionResult {
  ok: boolean
  outputFormat: 'json' | 'markdown'
  title: string
  summary: string
  // For JSON missions: the parsed structured object.
  // For markdown missions: a small structured envelope with markdown body.
  structured: Record<string, unknown>
  // Plain-text content for storage/search. For json it's a pretty-printed
  // JSON; for markdown it's the raw markdown.
  content: string
  recommendedNextMissions: RecommendedNextMission[]
  contextUpdates: ClarifyBusinessIdeaOutput['context_updates']
  memoryItems: ClarifyBusinessIdeaOutput['memory_items']
  model: string
  tokenUsage: {
    input: number
    output: number
  } | null
  error?: string
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing on server')
  return new Anthropic({ apiKey })
}

interface AnthropicTextContent {
  type: 'text'
  text: string
}

function extractTextFromMessage(message: Anthropic.Message): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (block.type === 'text') {
      parts.push((block as AnthropicTextContent).text)
    }
  }
  return parts.join('\n').trim()
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) return fenced[1].trim()
  // Sometimes the model wraps in `{ ... }` after a brief preamble. Extract
  // the first balanced {...} block.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function tryParseJson(raw: string): unknown {
  return JSON.parse(stripJsonFences(raw))
}

function extractNextMissionsFromMarkdown(markdown: string): RecommendedNextMission[] {
  const marker = markdown.match(
    /<!--\s*AUTARS_NEXT_MISSIONS\s*:\s*(\[[\s\S]*?\])\s*-->/i,
  )
  if (!marker) return []
  try {
    const parsed = JSON.parse(marker[1]) as RecommendedNextMission[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m) =>
        m &&
        typeof m.title === 'string' &&
        typeof m.description === 'string' &&
        typeof m.agent_role === 'string',
    )
  } catch {
    return []
  }
}

function deriveMarkdownTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() || fallback
}

function deriveMarkdownSummary(markdown: string, fallback: string): string {
  const tldr = markdown.match(/##\s*TL;DR\s*\n+([\s\S]*?)(?:\n##|$)/i)
  const snippet = tldr?.[1]?.trim()
  if (snippet) return snippet.split('\n').slice(0, 3).join(' ').trim()
  // First non-heading paragraph.
  const lines = markdown.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return trimmed.slice(0, 280)
  }
  return fallback
}

async function callAnthropicJson(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
  client: Anthropic,
  attempt: number,
): Promise<{ raw: string; usage: Anthropic.Message['usage']; model: string }> {
  const userPrompt = def.buildUserPrompt(ctx)
  // Pre-fill the assistant turn with `{` to coerce JSON-shaped output.
  const message = await client.messages.create({
    model: def.model,
    max_tokens: def.maxTokens,
    system: def.systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: '{' },
    ],
  })
  let text = extractTextFromMessage(message)
  // The prefill `{` is NOT echoed back in `message.content`, so we re-add it.
  if (!text.startsWith('{')) text = `{${text}`
  if (attempt === 0) {
    return { raw: text, usage: message.usage, model: message.model }
  }
  return { raw: text, usage: message.usage, model: message.model }
}

async function callAnthropicMarkdown(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
  client: Anthropic,
): Promise<{ raw: string; usage: Anthropic.Message['usage']; model: string }> {
  const userPrompt = def.buildUserPrompt(ctx)
  const tools: Array<{ type: string; name: string }> = []
  if (def.enableWebSearch) tools.push({ type: 'web_search_20260209', name: 'web_search' })
  if (def.enableWebFetch) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch' })

  const params = {
    model: def.model,
    max_tokens: def.maxTokens,
    system: def.systemPrompt,
    messages: [{ role: 'user' as const, content: userPrompt }],
    ...(tools.length > 0 ? { tools } : {}),
  }
  const message = (await client.messages.create(
    params as Parameters<typeof client.messages.create>[0],
  )) as Anthropic.Message
  return { raw: extractTextFromMessage(message), usage: message.usage, model: message.model }
}

export async function runAgentMission(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
): Promise<AgentExecutionResult> {
  const client = getClient()

  if (def.outputFormat === 'json') {
    let lastError = ''
    let lastRaw = ''
    let lastUsage: Anthropic.Message['usage'] | null = null
    let lastModel = def.model
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { raw, usage, model } = await callAnthropicJson(def, ctx, client, attempt)
        lastRaw = raw
        lastUsage = usage
        lastModel = model
        const parsed = tryParseJson(raw)
        const validation = def.validateOutput ? def.validateOutput(parsed) : null
        if (validation) {
          lastError = `output_validation_failed: ${validation}`
          continue
        }
        const structured = parsed as ClarifyBusinessIdeaOutput
        return {
          ok: true,
          outputFormat: 'json',
          title: structured.title,
          summary: structured.summary,
          structured: structured as unknown as Record<string, unknown>,
          content: JSON.stringify(structured, null, 2),
          recommendedNextMissions: Array.isArray(structured.recommended_next_missions)
            ? structured.recommended_next_missions
            : [],
          contextUpdates: structured.context_updates,
          memoryItems: structured.memory_items,
          model: lastModel,
          tokenUsage: lastUsage
            ? { input: lastUsage.input_tokens ?? 0, output: lastUsage.output_tokens ?? 0 }
            : null,
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    return {
      ok: false,
      outputFormat: 'json',
      title: 'Échec agent',
      summary: lastError || 'Agent execution failed',
      structured: { raw: lastRaw, error: lastError },
      content: lastRaw,
      recommendedNextMissions: [],
      contextUpdates: undefined,
      memoryItems: undefined,
      model: lastModel,
      tokenUsage: lastUsage
        ? { input: lastUsage.input_tokens ?? 0, output: lastUsage.output_tokens ?? 0 }
        : null,
      error: lastError,
    }
  }

  // Markdown path (scan, brand-kit, etc.)
  try {
    const { raw, usage, model } = await callAnthropicMarkdown(def, ctx, client)
    const title = deriveMarkdownTitle(raw, ctx.missionTitle)
    const summary = deriveMarkdownSummary(raw, '')
    const nextMissions = extractNextMissionsFromMarkdown(raw)
    // Strip the AUTARS_NEXT_MISSIONS marker from the rendered markdown.
    const cleaned = raw.replace(/<!--\s*AUTARS_NEXT_MISSIONS\s*:[\s\S]*?-->/i, '').trim()
    const structured: ScanReportOutput = {
      title,
      summary,
      markdown: cleaned,
      recommended_next_missions: nextMissions,
    }
    return {
      ok: true,
      outputFormat: 'markdown',
      title,
      summary,
      structured: structured as unknown as Record<string, unknown>,
      content: cleaned,
      recommendedNextMissions: nextMissions,
      contextUpdates: undefined,
      memoryItems: undefined,
      model,
      tokenUsage: usage
        ? { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 }
        : null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      outputFormat: 'markdown',
      title: 'Échec agent',
      summary: message,
      structured: { error: message },
      content: '',
      recommendedNextMissions: [],
      contextUpdates: undefined,
      memoryItems: undefined,
      model: def.model,
      tokenUsage: null,
      error: message,
    }
  }
}
