// =====================================================================
// HTTP handlers for the real agent runner
// =====================================================================
// Endpoints:
//   POST /api/agents/run      { missionId }           -> { runId, deliverable, mission }
//   POST /api/agents/iterate  { deliverableId, feedback } -> { runId, deliverable }
//   POST /api/agents/decide   { deliverableId, decision, feedback? } -> { ok, mission }
//   POST /api/agents/next     { fromDeliverableId, recommendationIndex } -> { ok, missionId }
//
// Auth: every request must include `Authorization: Bearer <supabase access token>`.
// Writes go through the service-role client; reads also via service role for speed.
// =====================================================================

import type { IncomingMessage, ServerResponse } from 'node:http'
import { admin, hasAdmin, resolveUserId } from './supabaseAdmin'
import { resolveAgentMission } from './agents'
import {
  runAgentMission,
  type AgentExecutionResult,
  type AgentProgressEvent,
} from './agents/runAgentMission'
import { indexDeliverable, hasEmbeddings } from './memory'
import type { AgentRunContext, RecommendedNextMission } from './agents/types'
import {
  DecidePayloadSchema,
  IteratePayloadSchema,
  NextPayloadSchema,
  RunPayloadSchema,
  formatZodError,
} from './agents/schemas'

// ---------------------------------------------------------------------
// Failure helper — flips the run/mission/agent to terminal-failed state
// and emits a `run_failed` activity event so the UI is never stuck in
// `working` indefinitely.
// ---------------------------------------------------------------------
async function markRunFailed(params: {
  runId: string | null
  missionId: string
  workspaceId: string
  ownerId: string
  agentId: string | null
  missionTitle: string
  error: string
}) {
  const sb = admin()
  if (params.runId) {
    await sb
      .from('agent_runs')
      .update({
        status: 'failed',
        error_message: params.error,
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.runId)
      .then(undefined, () => undefined)
  }
  await sb
    .from('missions')
    .update({ status: 'failed' })
    .eq('id', params.missionId)
    .then(undefined, () => undefined)
  if (params.agentId) {
    await sb
      .from('agents')
      .update({ status: 'idle' })
      .eq('id', params.agentId)
      .then(undefined, () => undefined)
  }
  await sb
    .from('activity_events')
    .insert({
      workspace_id: params.workspaceId,
      owner_id: params.ownerId,
      agent_id: params.agentId,
      mission_id: params.missionId,
      event_type: 'run_failed',
      title: `Échec mission : ${params.missionTitle}`,
      description: params.error.slice(0, 500),
      metadata: { run_id: params.runId, error: params.error },
    })
    .then(undefined, () => undefined)
}

// ---------------------------------------------------------------------
// http helpers
// ---------------------------------------------------------------------
async function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<unknown>

// Outer safety net: any throw inside `inner` returns a clean 500 with the
// error message instead of crashing the Vite middleware. Per-handler logic
// already does its own state-cleanup via executeRun/markRunFailed; this
// wrapper exists for cases where an error happens BEFORE executeRun runs.
function withSafety(inner: Handler): Handler {
  return async (req, res) => {
    try {
      await inner(req, res)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!res.headersSent) {
        send(res, 500, { error: 'internal_error', detail: message })
      } else {
        try {
          res.end()
        } catch {
          // socket already gone
        }
      }
    }
  }
}

function bearerOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header || typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<string | null> {
  if (!hasAdmin()) {
    send(res, 500, { error: 'SUPABASE_SERVICE_ROLE_KEY not configured on server' })
    return null
  }
  const token = bearerOf(req)
  if (!token) {
    send(res, 401, { error: 'missing_bearer_token' })
    return null
  }
  const userId = await resolveUserId(token)
  if (!userId) {
    send(res, 401, { error: 'invalid_token' })
    return null
  }
  return userId
}

// ---------------------------------------------------------------------
// context loading
// ---------------------------------------------------------------------
async function loadRunContext(params: {
  missionId: string
  ownerId: string
  iterationFeedback?: string
  previousDeliverableContent?: Record<string, unknown>
}): Promise<AgentRunContext | { error: string }> {
  const sb = admin()

  const { data: mission, error: missionError } = await sb
    .from('missions')
    .select('*')
    .eq('id', params.missionId)
    .single()
  if (missionError || !mission) return { error: 'mission_not_found' }
  if (mission.owner_id !== params.ownerId) return { error: 'mission_forbidden' }

  const { data: workspace, error: wsError } = await sb
    .from('workspaces')
    .select('*')
    .eq('id', mission.workspace_id)
    .single()
  if (wsError || !workspace) return { error: 'workspace_not_found' }

  const { data: contextRow } = await sb
    .from('workspace_context')
    .select('*')
    .eq('workspace_id', mission.workspace_id)
    .maybeSingle()

  const { data: validatedDeliverables } = await sb
    .from('deliverables')
    .select('id, mission_id, title, structured_content, status, created_at')
    .eq('workspace_id', mission.workspace_id)
    .eq('status', 'validated')
    .order('created_at', { ascending: false })
    .limit(5)

  const missionTitlesById = new Map<string, string>()
  if (validatedDeliverables && validatedDeliverables.length > 0) {
    const ids = Array.from(new Set(validatedDeliverables.map((d) => d.mission_id)))
    const { data: titleRows } = await sb
      .from('missions')
      .select('id, title')
      .in('id', ids)
    titleRows?.forEach((row) => missionTitlesById.set(row.id, row.title))
  }

  const { data: memoryRows } = mission.agent_id
    ? await sb
        .from('agent_memory')
        .select('memory_type, content')
        .eq('agent_id', mission.agent_id)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: [] as Array<{ memory_type: string; content: string }> }

  return {
    workspaceId: mission.workspace_id,
    ownerId: params.ownerId,
    missionId: mission.id,
    agentId: mission.agent_id,
    missionTitle: mission.title,
    missionDescription: mission.description ?? '',
    missionType: mission.type,
    workspace: {
      name: workspace.name,
      description: workspace.description ?? '',
      stage: workspace.stage ?? 'idea',
    },
    context: {
      business_idea: contextRow?.business_idea ?? null,
      target_customer: contextRow?.target_customer ?? null,
      market: contextRow?.market ?? null,
      tone: contextRow?.tone ?? null,
      constraints: contextRow?.constraints ?? null,
      goals: contextRow?.goals ?? null,
    },
    previousDeliverables: (validatedDeliverables ?? []).map((d) => ({
      mission_title: missionTitlesById.get(d.mission_id) ?? 'Mission',
      title: d.title,
      summary:
        typeof (d.structured_content as { summary?: string } | null)?.summary === 'string'
          ? ((d.structured_content as { summary?: string }).summary as string)
          : null,
      structured_content: (d.structured_content as Record<string, unknown>) ?? {},
      decision: 'validated' as const,
    })),
    agentMemory: (memoryRows ?? []).map((m) => ({
      memory_type: m.memory_type,
      content: m.content,
    })),
    iterationFeedback: params.iterationFeedback,
    previousDeliverableContent: params.previousDeliverableContent,
  }
}

// ---------------------------------------------------------------------
// run execution helper
// ---------------------------------------------------------------------
async function executeRun(params: {
  ownerId: string
  workspaceId: string
  agentId: string | null
  missionId: string
  missionTitle: string
  missionType: string | null
  context: AgentRunContext
  previousDeliverableId?: string | null
}): Promise<
  | {
      ok: true
      runId: string
      deliverableId: string
      result: AgentExecutionResult
    }
  | { ok: false; error: string }
> {
  const sb = admin()
  let runId: string | null = null

  try {
    // 1. Create the agent_run in `queued`. Unique partial index prevents
    // concurrent runs on the same mission.
    const { data: runRow, error: runInsertError } = await sb
      .from('agent_runs')
      .insert({
        owner_id: params.ownerId,
        workspace_id: params.workspaceId,
        agent_id: params.agentId,
        mission_id: params.missionId,
        status: 'queued',
        input_context: { type: params.missionType },
      })
      .select('id')
      .single()
    if (runInsertError || !runRow) {
      return { ok: false, error: runInsertError?.message ?? 'run_insert_failed' }
    }
    runId = runRow.id as string

    // 2. Activity event + mission flip + agent working
    await sb.from('activity_events').insert({
      workspace_id: params.workspaceId,
      owner_id: params.ownerId,
      agent_id: params.agentId,
      mission_id: params.missionId,
      event_type: 'run_queued',
      title: `Agent en file d'attente : ${params.missionTitle}`,
      description: null,
      metadata: { run_id: runId },
    })

    // 3. Flip run to running, mission to running, agent to working
    await sb
      .from('agent_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', runId)
    await sb
      .from('missions')
      .update({ status: 'in_progress', last_run_id: runId })
      .eq('id', params.missionId)
    if (params.agentId) {
      await sb.from('agents').update({ status: 'working' }).eq('id', params.agentId)
    }
    await sb.from('activity_events').insert({
      workspace_id: params.workspaceId,
      owner_id: params.ownerId,
      agent_id: params.agentId,
      mission_id: params.missionId,
      event_type: 'run_started',
      title: `Agent au travail : ${params.missionTitle}`,
      description: null,
      metadata: { run_id: runId },
    })

    // 4. Execute the LLM call with a progress callback that streams each
    // ReAct phase (plan/act/synthesize) to activity_events.
    const def = resolveAgentMission(params.missionType)
    const onProgress = async (evt: AgentProgressEvent) => {
      await sb.from('activity_events').insert({
        workspace_id: params.workspaceId,
        owner_id: params.ownerId,
        agent_id: params.agentId,
        mission_id: params.missionId,
        event_type: 'agent_thinking',
        title: evt.title,
        description: evt.description,
        metadata: { run_id: runId, phase: evt.phase },
      })
    }
    const result = await runAgentMission(def, params.context, onProgress)

    if (!result.ok) {
      await sb
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: result.error ?? 'unknown_error',
          completed_at: new Date().toISOString(),
          model: result.model,
          token_usage: result.tokenUsage,
        })
        .eq('id', runId)
      await sb.from('missions').update({ status: 'failed' }).eq('id', params.missionId)
      if (params.agentId) {
        await sb.from('agents').update({ status: 'idle' }).eq('id', params.agentId)
      }
      await sb.from('activity_events').insert({
        workspace_id: params.workspaceId,
        owner_id: params.ownerId,
        agent_id: params.agentId,
        mission_id: params.missionId,
        event_type: 'run_failed',
        title: `Échec mission : ${params.missionTitle}`,
        description: (result.error ?? '').slice(0, 500),
        metadata: { run_id: runId, error: result.error ?? null },
      })
      return { ok: false, error: result.error ?? 'agent_failed' }
    }

    // 5. Determine deliverable version (previous + 1 for same mission)
    const { data: priorMax } = await sb
      .from('deliverables')
      .select('version')
      .eq('mission_id', params.missionId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextVersion = (priorMax?.version ?? 0) + 1

    // 6. Insert the deliverable
    const { data: deliverable, error: deliverableError } = await sb
      .from('deliverables')
      .insert({
        owner_id: params.ownerId,
        workspace_id: params.workspaceId,
        mission_id: params.missionId,
        agent_run_id: runId,
        previous_version_id: params.previousDeliverableId ?? null,
        agent_id: params.agentId,
        title: result.title,
        type: result.outputFormat === 'json' ? 'structured' : 'markdown',
        content: result.content,
        structured_content: result.structured,
        version: nextVersion,
        status: 'pending_validation',
      })
      .select('id')
      .single()
    if (deliverableError || !deliverable) {
      const errMsg = deliverableError?.message ?? 'deliverable_insert_failed'
      await markRunFailed({
        runId,
        missionId: params.missionId,
        workspaceId: params.workspaceId,
        ownerId: params.ownerId,
        agentId: params.agentId,
        missionTitle: params.missionTitle,
        error: errMsg,
      })
      return { ok: false, error: errMsg }
    }

    // 7. Workspace context updates
    if (result.contextUpdates) {
      const updates: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(result.contextUpdates)) {
        if (typeof value === 'string' && value.trim()) updates[key] = value
      }
      if (Object.keys(updates).length > 0) {
        await sb
          .from('workspace_context')
          .update(updates)
          .eq('workspace_id', params.workspaceId)
      }
    }

    // 8. Agent memory items
    if (params.agentId && result.memoryItems && result.memoryItems.length > 0) {
      await sb.from('agent_memory').insert(
        result.memoryItems.slice(0, 8).map((m) => ({
          owner_id: params.ownerId,
          workspace_id: params.workspaceId,
          agent_id: params.agentId as string,
          memory_type: m.memory_type,
          content: m.content,
          source_mission_id: params.missionId,
          source_deliverable_id: deliverable.id,
        })),
      )
    }

    // 8b. Long-term memory — embed + insert into agent_memories so future
    // missions can RAG-recall this deliverable via the `search_memory`
    // tool. Best-effort: a missing OPENAI_EMBED_API_KEY or a network
    // hiccup must NEVER fail the mission.
    if (hasEmbeddings() && result.content) {
      try {
        const indexed = await indexDeliverable({
          ownerId: params.ownerId,
          workspaceId: params.workspaceId,
          agentId: params.agentId,
          missionId: params.missionId,
          deliverableId: deliverable.id,
          title: result.title,
          content: result.content,
        })
        if (indexed.ok) {
          await sb.from('activity_events').insert({
            workspace_id: params.workspaceId,
            owner_id: params.ownerId,
            agent_id: params.agentId,
            mission_id: params.missionId,
            event_type: 'agent_thinking',
            title: 'Mémoire indexée',
            description: `${indexed.inserted} chunk(s) RAG ajoutés.`,
            metadata: { deliverable_id: deliverable.id, chunks: indexed.inserted },
          })
        }
      } catch (err) {
        console.warn(
          '[agent-handlers] indexDeliverable threw:',
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    // 9. Close the run + flip mission to waiting_user_decision
    await sb
      .from('agent_runs')
      .update({
        status: 'waiting_user_decision',
        completed_at: new Date().toISOString(),
        output_summary: result.summary,
        model: result.model,
        token_usage: result.tokenUsage,
      })
      .eq('id', runId)

    await sb
      .from('missions')
      .update({
        status: 'waiting_user_decision',
        current_deliverable_id: deliverable.id,
        result: {
          summary: result.summary,
          deliverable_id: deliverable.id,
          agent_run_id: runId,
        },
      })
      .eq('id', params.missionId)

    if (params.agentId) {
      await sb.from('agents').update({ status: 'done' }).eq('id', params.agentId)
    }

    await sb.from('activity_events').insert([
      {
        workspace_id: params.workspaceId,
        owner_id: params.ownerId,
        agent_id: params.agentId,
        mission_id: params.missionId,
        event_type: 'run_completed',
        title: `Agent a terminé : ${params.missionTitle}`,
        description: result.summary?.slice(0, 200) ?? null,
        metadata: { run_id: runId, deliverable_id: deliverable.id },
      },
      {
        workspace_id: params.workspaceId,
        owner_id: params.ownerId,
        agent_id: params.agentId,
        mission_id: params.missionId,
        event_type: 'deliverable_created',
        title: `Livrable prêt : ${result.title}`,
        description: result.summary?.slice(0, 200) ?? null,
        metadata: { deliverable_id: deliverable.id, version: nextVersion },
      },
    ])

    return { ok: true, runId, deliverableId: deliverable.id, result }
  } catch (err) {
    // Last-resort safety net. Any uncaught exception (LLM timeout, network
    // error, supabase fault, JSON parse blowup) ends here. We flip every
    // moving piece back to a terminal state so the UI doesn't get stuck
    // showing an agent forever "working".
    const message = err instanceof Error ? err.message : String(err)
    await markRunFailed({
      runId,
      missionId: params.missionId,
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      agentId: params.agentId,
      missionTitle: params.missionTitle,
      error: `unexpected_error: ${message}`,
    })
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------
// POST /api/agents/run
// ---------------------------------------------------------------------
export const handleAgentRun: Handler = withSafety(async (req, res) => {
  const ownerId = await requireAuth(req, res)
  if (!ownerId) return

  let rawPayload: unknown
  try {
    rawPayload = await readJson<unknown>(req)
  } catch (err) {
    return send(res, 400, { error: 'invalid_json', detail: String(err) })
  }
  const parsed = RunPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return send(res, 400, { error: 'invalid_payload', detail: formatZodError(parsed.error) })
  }
  const payload = parsed.data

  const sb = admin()
  const { data: mission, error: missionError } = await sb
    .from('missions')
    .select('*')
    .eq('id', payload.missionId)
    .single()
  if (missionError || !mission) return send(res, 404, { error: 'mission_not_found' })
  if (mission.owner_id !== ownerId) return send(res, 403, { error: 'forbidden' })

  // Guard against double-launch.
  if (mission.status === 'in_progress' || mission.status === 'waiting_user_decision') {
    return send(res, 409, { error: 'already_running', missionStatus: mission.status })
  }
  if (mission.status === 'completed') {
    return send(res, 409, { error: 'already_completed' })
  }

  // 1. Consume credits via RPC (transactional)
  const consumeAmount = mission.cost_credits ?? 1
  const { data: consumeData, error: consumeError } = await sb.rpc('consume_credits', {
    p_user_id: ownerId,
    p_workspace_id: mission.workspace_id,
    p_mission_id: mission.id,
    p_amount: consumeAmount,
    p_reason: `mission:${mission.title}`,
  })
  if (consumeError) return send(res, 500, { error: consumeError.message })
  const consume = Array.isArray(consumeData) ? consumeData[0] : consumeData
  if (!consume?.ok) {
    if (consume?.error === 'insufficient_credits') {
      await sb.from('activity_events').insert({
        workspace_id: mission.workspace_id,
        owner_id: ownerId,
        agent_id: mission.agent_id,
        mission_id: mission.id,
        event_type: 'credits_insufficient',
        title: 'Crédits insuffisants',
        description: `Mission "${mission.title}" bloquée.`,
        metadata: { required: consumeAmount, balance: consume?.new_balance ?? null },
      })
    }
    return send(res, 402, {
      error: consume?.error ?? 'consume_failed',
      newBalance: consume?.new_balance ?? null,
      requiredCredits: consumeAmount,
    })
  }

  await sb.from('activity_events').insert({
    workspace_id: mission.workspace_id,
    owner_id: ownerId,
    agent_id: mission.agent_id,
    mission_id: mission.id,
    event_type: 'credits_consumed',
    title: `-${consumeAmount} crédit${consumeAmount > 1 ? 's' : ''}`,
    description: `Mission "${mission.title}"`,
    metadata: {
      amount: -consumeAmount,
      new_balance: consume.new_balance,
      transaction_id: consume.transaction_id,
    },
  })
  await sb.from('activity_events').insert({
    workspace_id: mission.workspace_id,
    owner_id: ownerId,
    agent_id: mission.agent_id,
    mission_id: mission.id,
    event_type: 'mission_started',
    title: `Mission "${mission.title}" lancée`,
    description: `Coût : ${consumeAmount} crédit${consumeAmount > 1 ? 's' : ''}.`,
    metadata: { cost_credits: consumeAmount },
  })

  // 2. Build context + execute
  const ctxOrError = await loadRunContext({ missionId: mission.id, ownerId })
  if ('error' in ctxOrError) return send(res, 400, { error: ctxOrError.error })

  const execution = await executeRun({
    ownerId,
    workspaceId: mission.workspace_id,
    agentId: mission.agent_id,
    missionId: mission.id,
    missionTitle: mission.title,
    missionType: mission.type,
    context: ctxOrError,
  })

  if (!execution.ok) return send(res, 502, { error: execution.error })

  return send(res, 200, {
    ok: true,
    runId: execution.runId,
    deliverableId: execution.deliverableId,
    newBalance: consume.new_balance,
  })
})

// ---------------------------------------------------------------------
// POST /api/agents/iterate
// ---------------------------------------------------------------------
export const handleAgentIterate: Handler = withSafety(async (req, res) => {
  const ownerId = await requireAuth(req, res)
  if (!ownerId) return

  let rawPayload: unknown
  try {
    rawPayload = await readJson<unknown>(req)
  } catch (err) {
    return send(res, 400, { error: 'invalid_json', detail: String(err) })
  }
  const parsed = IteratePayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return send(res, 400, { error: 'invalid_payload', detail: formatZodError(parsed.error) })
  }
  const payload = parsed.data

  const sb = admin()
  const { data: deliverable, error: dErr } = await sb
    .from('deliverables')
    .select('*')
    .eq('id', payload.deliverableId)
    .single()
  if (dErr || !deliverable) return send(res, 404, { error: 'deliverable_not_found' })
  if (deliverable.owner_id !== ownerId) return send(res, 403, { error: 'forbidden' })

  // Mark previous deliverable as needs_improvement, log decision.
  await sb
    .from('deliverables')
    .update({ status: 'needs_improvement' })
    .eq('id', deliverable.id)
  await sb.from('decisions').insert({
    owner_id: ownerId,
    workspace_id: deliverable.workspace_id,
    mission_id: deliverable.mission_id,
    deliverable_id: deliverable.id,
    decision_type: 'needs_improvement',
    feedback: payload.feedback,
    metadata: {},
  })
  await sb.from('activity_events').insert({
    workspace_id: deliverable.workspace_id,
    owner_id: ownerId,
    agent_id: deliverable.agent_id,
    mission_id: deliverable.mission_id,
    event_type: 'deliverable_iteration_requested',
    title: 'Amélioration demandée',
    description: payload.feedback.slice(0, 200),
    metadata: { deliverable_id: deliverable.id },
  })

  // Flip mission back to running, kick off a new run.
  const { data: mission, error: mErr } = await sb
    .from('missions')
    .select('*')
    .eq('id', deliverable.mission_id)
    .single()
  if (mErr || !mission) return send(res, 404, { error: 'mission_not_found' })

  await sb.from('missions').update({ status: 'in_progress' }).eq('id', mission.id)

  const ctxOrError = await loadRunContext({
    missionId: mission.id,
    ownerId,
    iterationFeedback: payload.feedback,
    previousDeliverableContent: deliverable.structured_content as Record<string, unknown>,
  })
  if ('error' in ctxOrError) return send(res, 400, { error: ctxOrError.error })

  const execution = await executeRun({
    ownerId,
    workspaceId: mission.workspace_id,
    agentId: mission.agent_id,
    missionId: mission.id,
    missionTitle: mission.title,
    missionType: mission.type,
    context: ctxOrError,
    previousDeliverableId: deliverable.id,
  })

  if (!execution.ok) return send(res, 502, { error: execution.error })

  return send(res, 200, {
    ok: true,
    runId: execution.runId,
    deliverableId: execution.deliverableId,
  })
})

// ---------------------------------------------------------------------
// POST /api/agents/decide  (validate | reject)
// ---------------------------------------------------------------------
export const handleAgentDecide: Handler = withSafety(async (req, res) => {
  const ownerId = await requireAuth(req, res)
  if (!ownerId) return

  let rawPayload: unknown
  try {
    rawPayload = await readJson<unknown>(req)
  } catch (err) {
    return send(res, 400, { error: 'invalid_json', detail: String(err) })
  }
  const parsed = DecidePayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return send(res, 400, { error: 'invalid_payload', detail: formatZodError(parsed.error) })
  }
  const payload = parsed.data

  const sb = admin()
  const { data: deliverable, error: dErr } = await sb
    .from('deliverables')
    .select('*')
    .eq('id', payload.deliverableId)
    .single()
  if (dErr || !deliverable) return send(res, 404, { error: 'deliverable_not_found' })
  if (deliverable.owner_id !== ownerId) return send(res, 403, { error: 'forbidden' })

  const { data: mission, error: mErr } = await sb
    .from('missions')
    .select('*')
    .eq('id', deliverable.mission_id)
    .single()
  if (mErr || !mission) return send(res, 404, { error: 'mission_not_found' })

  await sb
    .from('deliverables')
    .update({ status: payload.decision })
    .eq('id', deliverable.id)
  await sb.from('decisions').insert({
    owner_id: ownerId,
    workspace_id: deliverable.workspace_id,
    mission_id: deliverable.mission_id,
    deliverable_id: deliverable.id,
    decision_type: payload.decision,
    feedback: payload.feedback ?? null,
    metadata: {},
  })

  if (payload.decision === 'validated') {
    await sb
      .from('missions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', mission.id)

    // Award XP if not awarded yet.
    if (!mission.xp_awarded && mission.agent_id) {
      const { error: xpError } = await sb.rpc('award_mission_xp', {
        p_user_id: ownerId,
        p_agent_id: mission.agent_id,
        p_xp: mission.xp_reward ?? 20,
      })
      if (!xpError) {
        await sb
          .from('missions')
          .update({ xp_awarded: true })
          .eq('id', mission.id)
      }
    }

    await sb.from('activity_events').insert([
      {
        workspace_id: deliverable.workspace_id,
        owner_id: ownerId,
        agent_id: deliverable.agent_id,
        mission_id: deliverable.mission_id,
        event_type: 'deliverable_validated',
        title: `Livrable validé : ${deliverable.title}`,
        description: payload.feedback ?? null,
        metadata: { deliverable_id: deliverable.id },
      },
      {
        workspace_id: deliverable.workspace_id,
        owner_id: ownerId,
        agent_id: deliverable.agent_id,
        mission_id: deliverable.mission_id,
        event_type: 'mission_completed',
        title: `Mission "${mission.title}" terminée`,
        description: 'Validée par le fondateur.',
        metadata: { deliverable_id: deliverable.id },
      },
    ])
  } else {
    await sb.from('missions').update({ status: 'failed' }).eq('id', mission.id)
    await sb.from('activity_events').insert({
      workspace_id: deliverable.workspace_id,
      owner_id: ownerId,
      agent_id: deliverable.agent_id,
      mission_id: deliverable.mission_id,
      event_type: 'deliverable_rejected',
      title: `Livrable rejeté : ${deliverable.title}`,
      description: payload.feedback ?? null,
      metadata: { deliverable_id: deliverable.id },
    })
  }

  return send(res, 200, { ok: true })
})

// ---------------------------------------------------------------------
// POST /api/agents/next
// ---------------------------------------------------------------------
const ROLE_TO_AGENT_NAME: Record<string, string> = {
  strategist: 'Stratège',
  builder: 'Builder',
  growth: 'Growth',
  finance: 'Finance',
}

export const handleAgentNext: Handler = withSafety(async (req, res) => {
  const ownerId = await requireAuth(req, res)
  if (!ownerId) return

  let rawPayload: unknown
  try {
    rawPayload = await readJson<unknown>(req)
  } catch (err) {
    return send(res, 400, { error: 'invalid_json', detail: String(err) })
  }
  const parsed = NextPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return send(res, 400, { error: 'invalid_payload', detail: formatZodError(parsed.error) })
  }
  const payload = parsed.data

  const sb = admin()
  const { data: deliverable, error: dErr } = await sb
    .from('deliverables')
    .select('*')
    .eq('id', payload.fromDeliverableId)
    .single()
  if (dErr || !deliverable) return send(res, 404, { error: 'deliverable_not_found' })
  if (deliverable.owner_id !== ownerId) return send(res, 403, { error: 'forbidden' })

  const structured = deliverable.structured_content as
    | { recommended_next_missions?: RecommendedNextMission[] }
    | null
  const recos = structured?.recommended_next_missions ?? []
  const reco = recos[payload.recommendationIndex]
  if (!reco) return send(res, 400, { error: 'recommendation_not_found' })

  // Resolve target agent by role within the workspace.
  const targetName = ROLE_TO_AGENT_NAME[reco.agent_role] ?? 'Stratège'
  const { data: agentRow } = await sb
    .from('agents')
    .select('id')
    .eq('workspace_id', deliverable.workspace_id)
    .eq('name', targetName)
    .maybeSingle()

  const { data: rpcData, error: rpcError } = await sb.rpc(
    'create_mission_from_recommendation',
    {
      p_workspace_id: deliverable.workspace_id,
      p_deliverable_id: deliverable.id,
      p_title: reco.title,
      p_description: reco.description,
      p_agent_id: agentRow?.id ?? null,
      p_type: reco.mission_type,
      p_cost_credits: reco.cost_credits ?? 1,
      p_xp_reward: 20,
      p_source_mission_id: deliverable.mission_id,
    },
  )
  if (rpcError) return send(res, 500, { error: rpcError.message })
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
  if (!row?.ok) return send(res, 500, { error: row?.error ?? 'rpc_failed' })

  return send(res, 200, { ok: true, missionId: row.mission_id })
})
