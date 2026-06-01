// =====================================================================
// Agent orchestrator — ReAct loop (plan → act → synthesize)
// =====================================================================
// Every mission runs through three sequential LLM phases. Each phase
// emits a progress event through the `onProgress` callback so the
// orchestrator can stream activity_events to the frontend's
// ActivityConsole in (near-)real-time.
//
//   1. PLAN      — short reasoning trace: what the agent sees, what it
//                  will do. Cheap call, ~300 tokens. Logged verbatim.
//   2. ACT       — main generation call. For JSON missions, output is a
//                  validated object. For markdown missions, output is a
//                  markdown body followed by a strict JSON metadata
//                  block parsed by zod.
//   3. SYNTHESIZE — local: validation + extraction of next-mission
//                   recommendations, context_updates, memory_items.
//
// This module never throws across the boundary. Every error path returns
// AgentExecutionResult with `ok:false` and a human-readable `error` so
// the caller can flip the mission state to `failed` cleanly.
//
// All LLM I/O goes through `server/llmClient.ts` (OpenAI-compatible) so
// the same code runs against Claude, GPT, or a local Ollama model by
// changing env vars only.
// =====================================================================

import type {
  AgentMissionDefinition,
  AgentRunContext,
  ClarifyBusinessIdeaOutput,
  RecommendedNextMission,
  ScanReportOutput,
} from './types'
import { getLLM, getLLMConfig } from '../llmClient'
import {
  AgentMetadataSchema,
  ClarifyBusinessIdeaOutputSchema,
  formatZodError,
} from './schemas'
import {
  asOpenAITools,
  executeToolCalls,
  toolsForRole,
  type OpenAIToolCall,
  type OpenAIToolMessage,
  type ToolDefinition,
  type ToolExecutionContext,
} from '../tools'

export type AgentPhase = 'plan' | 'act' | 'synthesize'

export interface AgentProgressEvent {
  phase: AgentPhase
  title: string
  description: string | null
}

export type ProgressCallback = (event: AgentProgressEvent) => Promise<void>

export interface AgentExecutionResult {
  ok: boolean
  outputFormat: 'json' | 'markdown'
  title: string
  summary: string
  structured: Record<string, unknown>
  content: string
  recommendedNextMissions: RecommendedNextMission[]
  contextUpdates: ClarifyBusinessIdeaOutput['context_updates']
  memoryItems: ClarifyBusinessIdeaOutput['memory_items']
  model: string
  tokenUsage: { input: number; output: number } | null
  // Sequence of phase events, returned for debug/logging.
  phases: AgentProgressEvent[]
  error?: string
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) return fenced[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function tryParseJson(raw: string): unknown {
  return JSON.parse(stripJsonFences(raw))
}

function extractMetadataBlock(markdown: string): {
  cleaned: string
  metadataRaw: string | null
} {
  const re = /<!--\s*AUTARS_METADATA\s*:\s*(\{[\s\S]*?\})\s*-->/i
  const match = markdown.match(re)
  if (!match) {
    // Backward-compat: older prompt used AUTARS_NEXT_MISSIONS array.
    const legacy = markdown.match(
      /<!--\s*AUTARS_NEXT_MISSIONS\s*:\s*(\[[\s\S]*?\])\s*-->/i,
    )
    if (legacy) {
      const legacyMeta = JSON.stringify({
        summary: '',
        recommended_next_missions: safeJsonArray(legacy[1]),
        memory_items: [],
      })
      return {
        cleaned: markdown
          .replace(/<!--\s*AUTARS_NEXT_MISSIONS\s*:[\s\S]*?-->/i, '')
          .trim(),
        metadataRaw: legacyMeta,
      }
    }
    return { cleaned: markdown.trim(), metadataRaw: null }
  }
  const cleaned = markdown.replace(re, '').trim()
  return { cleaned, metadataRaw: match[1] }
}

function safeJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
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
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return trimmed.slice(0, 280)
  }
  return fallback
}

interface CompletionUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

function usageToTokens(
  usage: CompletionUsage | undefined,
): { input: number; output: number } | null {
  if (!usage) return null
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
  }
}

async function emitProgress(
  cb: ProgressCallback | undefined,
  events: AgentProgressEvent[],
  evt: AgentProgressEvent,
): Promise<void> {
  events.push(evt)
  if (!cb) return
  try {
    await cb(evt)
  } catch {
    // Progress logging failures must never break the run.
  }
}

// ---------------------------------------------------------------------
// Phase 1 — planning
// ---------------------------------------------------------------------
const PLANNER_SYSTEM = `Tu es un agent IA d'Autars en phase de PLANIFICATION.
Tu reçois le contexte de la mission. Tu écris en 3 à 6 phrases courtes :
1. Ce que tu as compris du contexte (sans répéter mot pour mot).
2. Les éléments manquants ou hypothèses risquées.
3. Les étapes que tu vas suivre pour produire le livrable.
Ton : direct, opérationnel. Pas de salutations. Pas d'emoji. Pas de markdown.`

function buildPlannerUserPrompt(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
): string {
  const ctxLines: string[] = []
  ctxLines.push(`Mission : ${ctx.missionTitle} (type: ${def.missionType})`)
  if (ctx.missionDescription) ctxLines.push(`Description : ${ctx.missionDescription}`)
  ctxLines.push(`Filiale : ${ctx.workspace.name}`)
  if (ctx.workspace.description) ctxLines.push(`Pitch : ${ctx.workspace.description}`)
  if (ctx.context.business_idea) ctxLines.push(`Idée : ${ctx.context.business_idea}`)
  if (ctx.context.target_customer)
    ctxLines.push(`Cible : ${ctx.context.target_customer}`)
  if (ctx.context.market) ctxLines.push(`Marché : ${ctx.context.market}`)
  if (ctx.context.constraints)
    ctxLines.push(`Contraintes : ${ctx.context.constraints}`)
  if (ctx.previousDeliverables.length > 0) {
    ctxLines.push(
      `Livrables validés disponibles : ${ctx.previousDeliverables
        .slice(0, 5)
        .map((d) => d.mission_title)
        .join(', ')}`,
    )
  }
  if (ctx.iterationFeedback)
    ctxLines.push(`Feedback à intégrer : ${ctx.iterationFeedback}`)
  return `${ctxLines.join('\n')}\n\nDécris ton plan en 3 à 6 phrases.`
}

async function planPhase(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
): Promise<{ plan: string; model: string; usage: CompletionUsage | undefined }> {
  const client = getLLM()
  const cfg = getLLMConfig()
  const completion = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: 400,
    temperature: 0.2,
    messages: [
      { role: 'system', content: PLANNER_SYSTEM },
      { role: 'user', content: buildPlannerUserPrompt(def, ctx) },
    ],
  })
  const text = completion.choices[0]?.message?.content?.trim() ?? ''
  return { plan: text, model: completion.model, usage: completion.usage }
}

// ---------------------------------------------------------------------
// Phase 2 — action
// ---------------------------------------------------------------------
const MARKDOWN_METADATA_SUFFIX = `

À la toute fin du document, ajoute un bloc HTML invisible contenant un JSON valide. Ce bloc N'EST PAS rendu à l'utilisateur ; il sert au système.

Format EXACT, sans rien d'autre après :
<!--AUTARS_METADATA:{"summary":"<résumé 2 phrases>","recommended_next_missions":[{"title":"...","description":"...","agent_role":"strategist|builder|growth|finance","mission_type":"scan|positioning|segment|value-prop|offer|landing|acquisition|brand-kit|clarify-business-idea","priority":"high|medium|low"}],"memory_items":[{"memory_type":"fact|preference|constraint|validated_decision|rejected_idea","content":"..."}],"context_updates":{"business_idea":"...","target_customer":"..."}}-->

Règles du bloc :
- JSON STRICTEMENT VALIDE. Pas de commentaires, pas de trailing comma.
- recommended_next_missions : 2 à 4 entrées. Choisis des mission_type pertinents.
- memory_items : 0 à 5 entrées factuelles à mémoriser pour les prochaines missions.
- context_updates : ne mets que les champs effectivement enrichis par ton livrable.`

async function actPhase(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
  planText: string,
  onProgress: ProgressCallback | undefined,
  phasesAcc: AgentProgressEvent[],
): Promise<{ raw: string; model: string; usage: CompletionUsage | undefined }> {
  const client = getLLM()
  const cfg = getLLMConfig()
  const baseUserPrompt = def.buildUserPrompt(ctx)
  const userPrompt = planText
    ? `${baseUserPrompt}\n\nPlan annoncé :\n${planText}\n\nProduis maintenant le livrable demandé en respectant ce plan.`
    : baseUserPrompt

  // Resolve the tool registry for this mission. Pass `tools: []` in the
  // definition to fully disable tool calling for a strict-JSON mission.
  const toolDefs: ToolDefinition[] =
    def.tools !== undefined ? def.tools : toolsForRole(def.role)
  const useTools = toolDefs.length > 0
  const maxIterations = def.maxToolIterations ?? 4
  const toolCtx: ToolExecutionContext = {
    workspaceId: ctx.workspaceId,
    ownerId: ctx.ownerId,
    agentId: ctx.agentId,
    missionId: ctx.missionId,
  }

  const systemContent =
    def.outputFormat === 'markdown'
      ? `${def.systemPrompt}\n${MARKDOWN_METADATA_SUFFIX}`
      : def.systemPrompt

  // We keep a free-form `messages` array so we can append tool outputs
  // between iterations of the tool loop.
  const messages: Array<
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | {
        role: 'assistant'
        content: string | null
        tool_calls?: OpenAIToolCall[]
      }
    | OpenAIToolMessage
  > = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt },
  ]

  const aggregateUsage: CompletionUsage = {}
  const addUsage = (u: CompletionUsage | undefined) => {
    if (!u) return
    aggregateUsage.prompt_tokens =
      (aggregateUsage.prompt_tokens ?? 0) + (u.prompt_tokens ?? 0)
    aggregateUsage.completion_tokens =
      (aggregateUsage.completion_tokens ?? 0) + (u.completion_tokens ?? 0)
  }
  let lastModel = cfg.model

  // Anthropic's OpenAI-compatible endpoint rejects
  // `response_format: { type: 'json_object' }` (it expects `json_schema`
  // with an inline schema). The CLARIFY-style prompts are strict enough
  // that the model returns valid JSON without the hint, so we only set
  // response_format on providers we know accept the cheap form.
  const supportsJsonObject =
    cfg.provider === 'openai' ||
    cfg.provider === 'ollama' ||
    cfg.provider === 'custom'

  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const isLastIteration = iteration === maxIterations
    let completion: Awaited<
      ReturnType<typeof client.chat.completions.create>
    >
    try {
      completion = await client.chat.completions.create({
        model: cfg.model,
        max_tokens: def.maxTokens,
        temperature: def.outputFormat === 'json' ? 0.3 : 0.4,
        ...(def.outputFormat === 'json' && !useTools && supportsJsonObject
          ? { response_format: { type: 'json_object' as const } }
          : {}),
        // On the final iteration we keep the tool schemas in the
        // payload (otherwise providers can't interpret the prior
        // `tool` messages in history and may return empty content)
        // but force `tool_choice: 'none'` so the model must answer.
        ...(useTools
          ? {
              tools: asOpenAITools(toolDefs),
              tool_choice: isLastIteration
                ? ('none' as const)
                : ('auto' as const),
            }
          : {}),
        // Note: the OpenAI types here are intentionally loose because we
        // append `tool` and `assistant.tool_calls` messages between turns;
        // the SDK accepts them at runtime regardless.
        messages: messages as unknown as Parameters<
          typeof client.chat.completions.create
        >[0]['messages'],
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error(
        `[runAgentMission.actPhase] LLM call failed at iter ${iteration}/${maxIterations}` +
          ` (provider=${cfg.provider}, model=${cfg.model}, useTools=${useTools}, ` +
          `messages=${messages.length}): ${detail}`,
      )
      throw new Error(
        `llm_call_failed (iter=${iteration}, provider=${cfg.provider}): ${detail}`,
        { cause: err },
      )
    }
    lastModel = completion.model || lastModel
    addUsage(completion.usage)

    const choice = completion.choices[0]
    const assistantMsg = choice?.message
    const toolCalls = (assistantMsg?.tool_calls ?? []) as OpenAIToolCall[]

    if (useTools && toolCalls.length > 0 && !isLastIteration) {
      // Persist the assistant turn (with its tool_calls) before appending
      // the tool outputs — OpenAI requires the strict ordering
      //   assistant{tool_calls} → tool{...} → tool{...} → assistant{...}
      messages.push({
        role: 'assistant',
        content: assistantMsg?.content ?? null,
        tool_calls: toolCalls,
      })
      const dispatch = await executeToolCalls({
        toolCalls,
        tools: toolDefs,
        ctx: toolCtx,
        onProgress: async (entry) => {
          await emitProgress(onProgress, phasesAcc, {
            phase: 'act',
            title: entry.display,
            description: entry.ok ? null : 'Échec outil',
          })
        },
      })
      for (const m of dispatch.messages) messages.push(m)
      continue
    }

    const raw = assistantMsg?.content ?? ''

    // Anthropic occasionally returns an empty assistant message right
    // after a tool-call turn — typically because we dropped `tools` or
    // the conversation already contains the full answer. Nudge once
    // with an explicit user message asking for the final deliverable.
    if (!raw.trim() && !isLastIteration) {
      messages.push({
        role: 'assistant',
        content: assistantMsg?.content ?? null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      })
      messages.push({
        role: 'user',
        content:
          'Tu as toutes les informations nécessaires. Produis MAINTENANT le livrable final demandé, ' +
          'au format attendu (markdown complet OU JSON valide selon la mission). Pas d\'appel d\'outil supplémentaire.',
      })
      continue
    }

    return {
      raw,
      model: lastModel,
      usage: aggregateUsage,
    }
  }

  // Should be unreachable: loop returns on the iteration that has no
  // tool_calls (or the forced final iteration). Belt-and-braces.
  return { raw: '', model: lastModel, usage: aggregateUsage }
}

// ---------------------------------------------------------------------
// Phase 3 — synthesize (local, no LLM)
// ---------------------------------------------------------------------
function synthesizeJson(
  raw: string,
  def: AgentMissionDefinition,
): { ok: true; data: ClarifyBusinessIdeaOutput } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = tryParseJson(raw)
  } catch (err) {
    return {
      ok: false,
      error: `json_parse_failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (def.missionType === 'clarify-business-idea') {
    const result = ClarifyBusinessIdeaOutputSchema.safeParse(parsed)
    if (!result.success) {
      return { ok: false, error: `schema_invalid: ${formatZodError(result.error)}` }
    }
    return { ok: true, data: result.data as ClarifyBusinessIdeaOutput }
  }
  // Other JSON mission types: shallow shape check then trust.
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'output_not_object' }
  }
  return { ok: true, data: parsed as ClarifyBusinessIdeaOutput }
}

function synthesizeMarkdown(
  raw: string,
  ctx: AgentRunContext,
):
  | {
      ok: true
      markdown: string
      title: string
      summary: string
      recommendedNextMissions: RecommendedNextMission[]
      memoryItems: ClarifyBusinessIdeaOutput['memory_items']
      contextUpdates: ClarifyBusinessIdeaOutput['context_updates']
    }
  | { ok: false; error: string } {
  const { cleaned, metadataRaw } = extractMetadataBlock(raw)
  const title = deriveMarkdownTitle(cleaned, ctx.missionTitle)
  let summary = deriveMarkdownSummary(cleaned, '')
  let recommendedNextMissions: RecommendedNextMission[] = []
  let memoryItems: ClarifyBusinessIdeaOutput['memory_items'] = []
  let contextUpdates: ClarifyBusinessIdeaOutput['context_updates']

  if (metadataRaw) {
    try {
      const parsed = JSON.parse(metadataRaw)
      const result = AgentMetadataSchema.safeParse(parsed)
      if (result.success) {
        if (result.data.summary) summary = result.data.summary
        recommendedNextMissions = result.data.recommended_next_missions
        memoryItems = result.data.memory_items
        contextUpdates = result.data.context_updates
      } else {
        // Metadata invalid but body still useful — log and continue with empty extras.
        recommendedNextMissions = []
      }
    } catch {
      recommendedNextMissions = []
    }
  }

  return {
    ok: true,
    markdown: cleaned,
    title,
    summary,
    recommendedNextMissions,
    memoryItems,
    contextUpdates,
  }
}

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------
export async function runAgentMission(
  def: AgentMissionDefinition,
  ctx: AgentRunContext,
  onProgress?: ProgressCallback,
): Promise<AgentExecutionResult> {
  const phases: AgentProgressEvent[] = []
  let model = def.model
  let aggregateUsage: { input: number; output: number } = { input: 0, output: 0 }
  const addUsage = (u: CompletionUsage | undefined) => {
    const t = usageToTokens(u)
    if (t) {
      aggregateUsage = {
        input: aggregateUsage.input + t.input,
        output: aggregateUsage.output + t.output,
      }
    }
  }

  await emitProgress(onProgress, phases, {
    phase: 'plan',
    title: 'Analyse du contexte',
    description: 'Lecture du brief, du contexte du QG et des livrables précédents.',
  })

  // ---- Phase 1: PLAN ------------------------------------------------
  let planText: string
  try {
    const planResult = await planPhase(def, ctx)
    model = planResult.model || model
    addUsage(planResult.usage)
    planText = planResult.plan
    await emitProgress(onProgress, phases, {
      phase: 'plan',
      title: 'Plan annoncé',
      description: planText ? planText.slice(0, 500) : null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return failure({
      def,
      ctx,
      phases,
      error: `plan_phase_failed: ${message}`,
      model,
      tokenUsage: aggregateUsage,
    })
  }

  // ---- Phase 2: ACT -------------------------------------------------
  await emitProgress(onProgress, phases, {
    phase: 'act',
    title: 'Génération du livrable',
    description:
      def.outputFormat === 'json'
        ? 'Rédaction JSON structurée selon le schéma de la mission.'
        : 'Rédaction du livrable Markdown.',
  })

  let actRaw: string
  try {
    const actResult = await actPhase(def, ctx, planText, onProgress, phases)
    model = actResult.model || model
    addUsage(actResult.usage)
    actRaw = actResult.raw
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return failure({
      def,
      ctx,
      phases,
      error: `act_phase_failed: ${message}`,
      model,
      tokenUsage: aggregateUsage,
    })
  }

  if (!actRaw.trim()) {
    // LLM returned nothing usable. NOT a hard failure: the orchestrator
    // is expected to substitute a fallback deliverable so the user never
    // loses the credit silently. We expose this as a distinct outcome.
    console.error('[mission.run.empty]', {
      provider: getLLMConfig().provider,
      model,
      workspaceId: ctx.workspaceId,
      missionId: ctx.missionId,
      missionType: def.missionType,
      tokenUsage: aggregateUsage,
    })
    return failure({
      def,
      ctx,
      phases,
      error: 'empty_completion',
      model,
      tokenUsage: aggregateUsage,
    })
  }

  // ---- Phase 3: SYNTHESIZE -----------------------------------------
  await emitProgress(onProgress, phases, {
    phase: 'synthesize',
    title: 'Validation et extraction',
    description: 'Vérification du schéma, extraction des recommandations.',
  })

  if (def.outputFormat === 'json') {
    const synth = synthesizeJson(actRaw, def)
    if (!synth.ok) {
      return failure({
        def,
        ctx,
        phases,
        error: synth.error,
        model,
        tokenUsage: aggregateUsage,
        rawOutput: actRaw,
      })
    }
    const data = synth.data
    return {
      ok: true,
      outputFormat: 'json',
      title: data.title,
      summary: data.summary,
      structured: data as unknown as Record<string, unknown>,
      content: JSON.stringify(data, null, 2),
      recommendedNextMissions: Array.isArray(data.recommended_next_missions)
        ? data.recommended_next_missions
        : [],
      contextUpdates: data.context_updates,
      memoryItems: data.memory_items,
      model,
      tokenUsage: aggregateUsage,
      phases,
    }
  }

  const synth = synthesizeMarkdown(actRaw, ctx)
  if (!synth.ok) {
    return failure({
      def,
      ctx,
      phases,
      error: synth.error,
      model,
      tokenUsage: aggregateUsage,
      rawOutput: actRaw,
    })
  }
  const structured: ScanReportOutput = {
    title: synth.title,
    summary: synth.summary,
    markdown: synth.markdown,
    recommended_next_missions: synth.recommendedNextMissions,
  }
  return {
    ok: true,
    outputFormat: 'markdown',
    title: synth.title,
    summary: synth.summary,
    structured: structured as unknown as Record<string, unknown>,
    content: synth.markdown,
    recommendedNextMissions: synth.recommendedNextMissions,
    contextUpdates: synth.contextUpdates,
    memoryItems: synth.memoryItems,
    model,
    tokenUsage: aggregateUsage,
    phases,
  }
}

// ---------------------------------------------------------------------
// Failure helper
// ---------------------------------------------------------------------
function failure(params: {
  def: AgentMissionDefinition
  ctx: AgentRunContext
  phases: AgentProgressEvent[]
  error: string
  model: string
  tokenUsage: { input: number; output: number }
  rawOutput?: string
}): AgentExecutionResult {
  return {
    ok: false,
    outputFormat: params.def.outputFormat,
    title: `Échec ${params.ctx.missionTitle}`,
    summary: params.error,
    structured: params.rawOutput
      ? { error: params.error, raw: params.rawOutput }
      : { error: params.error },
    content: params.rawOutput ?? '',
    recommendedNextMissions: [],
    contextUpdates: undefined,
    memoryItems: undefined,
    model: params.model,
    tokenUsage:
      params.tokenUsage.input || params.tokenUsage.output
        ? params.tokenUsage
        : null,
    phases: params.phases,
    error: params.error,
  }
}
