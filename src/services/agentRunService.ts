// =====================================================================
// Agent run client (frontend)
// =====================================================================
// Thin POST helpers for the /api/agents/* endpoints. Auth is the user's
// current Supabase access token, attached as Bearer.
// =====================================================================

import { requireSupabase } from '../lib/supabaseClient'

async function bearer(): Promise<string> {
  const sb = requireSupabase()
  const { data, error } = await sb.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Pas de session active — reconnectez-vous.')
  return token
}

interface JsonError {
  error: string
  [key: string]: unknown
}

function isOk(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'ok' in data &&
    (data as { ok: unknown }).ok === true
  )
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: T | JsonError }> {
  const token = await bearer()
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  let data: T | JsonError
  try {
    data = (await response.json()) as T | JsonError
  } catch {
    data = { error: `non_json_response_${response.status}` } as JsonError
  }
  return { status: response.status, data }
}

export class AgentRunInsufficientCreditsError extends Error {
  readonly newBalance: number | null
  readonly requiredCredits: number
  constructor(newBalance: number | null, requiredCredits: number) {
    super(
      `Crédits insuffisants. Cette mission nécessite ${requiredCredits} crédit${
        requiredCredits > 1 ? 's' : ''
      }, mais votre solde est de ${newBalance ?? 0}.`,
    )
    this.newBalance = newBalance
    this.requiredCredits = requiredCredits
    this.name = 'AgentRunInsufficientCreditsError'
  }
}

export class AgentRunAlreadyActiveError extends Error {
  constructor() {
    super('Cette mission est déjà en cours.')
    this.name = 'AgentRunAlreadyActiveError'
  }
}

export class AgentRunMissingApiKeyError extends Error {
  constructor() {
    super(
      "Le service IA n'est pas configuré côté serveur. Le crédit n'a pas été débité.",
    )
    this.name = 'AgentRunMissingApiKeyError'
  }
}

export class AgentRunFailedError extends Error {
  readonly code: string
  readonly refunded: boolean
  constructor(code: string, friendly: string | null, refunded: boolean) {
    super(friendly || code)
    this.code = code
    this.refunded = refunded
    this.name = 'AgentRunFailedError'
  }
}

export interface AgentRunResponse {
  ok: true
  runId: string
  deliverableId: string
  newBalance: number | null
  usedFallback?: boolean
}

export async function startAgentRun(missionId: string): Promise<AgentRunResponse> {
  const { status, data } = await postJson<AgentRunResponse | JsonError>(
    '/api/agents/run',
    { missionId },
  )
  if (status === 200 && isOk(data)) return data as AgentRunResponse
  const errorPayload = data as JsonError
  if (status === 402) {
    throw new AgentRunInsufficientCreditsError(
      typeof errorPayload.newBalance === 'number' ? errorPayload.newBalance : null,
      typeof errorPayload.requiredCredits === 'number' ? errorPayload.requiredCredits : 1,
    )
  }
  if (status === 409) throw new AgentRunAlreadyActiveError()
  if (status === 503 && errorPayload.error === 'missing_ai_api_key') {
    throw new AgentRunMissingApiKeyError()
  }
  const friendly =
    typeof errorPayload.friendlyError === 'string'
      ? errorPayload.friendlyError
      : null
  const refunded =
    typeof errorPayload.refunded === 'boolean' ? errorPayload.refunded : false
  throw new AgentRunFailedError(
    errorPayload.error || `agent_run_failed_${status}`,
    friendly,
    refunded,
  )
}

export interface AgentIterateResponse {
  ok: true
  runId: string
  deliverableId: string
}

export async function iterateOnDeliverable(params: {
  deliverableId: string
  feedback: string
}): Promise<AgentIterateResponse> {
  const { status, data } = await postJson<AgentIterateResponse | JsonError>(
    '/api/agents/iterate',
    params,
  )
  if (status === 200 && isOk(data)) return data as AgentIterateResponse
  throw new Error((data as JsonError).error || `agent_iterate_failed_${status}`)
}

export async function decideOnDeliverable(params: {
  deliverableId: string
  decision: 'validated' | 'rejected'
  feedback?: string
}): Promise<void> {
  const { status, data } = await postJson('/api/agents/decide', params)
  if (status === 200 && isOk(data)) return
  throw new Error((data as JsonError).error || `agent_decide_failed_${status}`)
}

export async function createNextMissionFromRecommendation(params: {
  fromDeliverableId: string
  recommendationIndex: number
}): Promise<{ missionId: string }> {
  const { status, data } = await postJson<{ ok: true; missionId: string } | JsonError>(
    '/api/agents/next',
    params,
  )
  if (status === 200 && isOk(data)) {
    return { missionId: (data as { missionId: string }).missionId }
  }
  throw new Error((data as JsonError).error || `agent_next_failed_${status}`)
}
