import { requireSupabase } from '../lib/supabaseClient'
import type { Mission } from '../lib/types'
import {
  agentStatusToDb,
  missionRowToUi,
  missionStatusToDb,
} from './mappers'
import { logEvent } from './activityService'
import { consumeCredits, type ConsumeResult } from './creditsService'

export class InsufficientCreditsError extends Error {
  readonly balance: number | null
  readonly required: number
  constructor(balance: number | null, required: number) {
    super(
      `Crédits insuffisants. Cette mission nécessite ${required} crédit${
        required > 1 ? 's' : ''
      }, mais votre solde est de ${balance ?? 0}.`,
    )
    this.balance = balance
    this.required = required
    this.name = 'InsufficientCreditsError'
  }
}

export async function fetchMissions(workspaceId: string): Promise<Mission[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('missions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(missionRowToUi)
}

/**
 * Create AND start a mission. Inserts the mission as `todo`, then atomically
 * consumes credits via the RPC. If credits are insufficient, the mission stays
 * `blocked`, a `credits_insufficient` event is logged, and an
 * `InsufficientCreditsError` is thrown.
 */
export async function createMission(payload: {
  workspaceId: string
  agentId: string | null
  ownerId: string
  title: string
  description: string
  costCredits?: number
  type?: string | null
}): Promise<Mission> {
  const sb = requireSupabase()
  const cost = payload.costCredits ?? 1

  const { data: row, error } = await sb
    .from('missions')
    .insert({
      workspace_id: payload.workspaceId,
      agent_id: payload.agentId,
      owner_id: payload.ownerId,
      title: payload.title,
      description: payload.description,
      status: 'todo',
      priority: 'medium',
      cost_credits: cost,
      type: payload.type ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  await logEvent({
    workspaceId: payload.workspaceId,
    ownerId: payload.ownerId,
    agentId: payload.agentId,
    missionId: row.id,
    eventType: 'mission_created',
    title: `Nouvelle mission : ${payload.title}`,
    description: payload.description?.slice(0, 200) || null,
    metadata: { cost_credits: cost },
  })

  const launched = await launchMission({
    missionId: row.id,
    workspaceId: payload.workspaceId,
    ownerId: payload.ownerId,
    agentId: payload.agentId,
    cost,
    title: payload.title,
  })
  return launched.mission
}

/**
 * Start an existing `todo` mission: consume credits, flip mission to
 * `in_progress`, flip agent to `working`, log activity events.
 */
export async function launchMission(params: {
  missionId: string
  workspaceId: string
  ownerId: string
  agentId: string | null
  cost: number
  title: string
}): Promise<{ mission: Mission; consume: ConsumeResult }> {
  const sb = requireSupabase()

  const consume = await consumeCredits({
    userId: params.ownerId,
    workspaceId: params.workspaceId,
    missionId: params.missionId,
    amount: params.cost,
    reason: `mission:${params.title}`,
  })

  if (!consume.ok) {
    await sb
      .from('missions')
      .update({ status: 'blocked' })
      .eq('id', params.missionId)

    await logEvent({
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      missionId: params.missionId,
      agentId: params.agentId,
      eventType: 'credits_insufficient',
      title: 'Crédits insuffisants',
      description: `Mission "${params.title}" bloquée : solde insuffisant.`,
      metadata: {
        required: params.cost,
        balance: consume.newBalance,
        error: consume.error,
      },
    })

    throw new InsufficientCreditsError(consume.newBalance, params.cost)
  }

  const { data: updated, error: updateError } = await sb
    .from('missions')
    .update({ status: 'in_progress' })
    .eq('id', params.missionId)
    .select('*')
    .single()
  if (updateError) throw updateError

  if (params.agentId) {
    await sb
      .from('agents')
      .update({ status: agentStatusToDb('travaille') })
      .eq('id', params.agentId)
  }

  await Promise.all([
    logEvent({
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      missionId: params.missionId,
      agentId: params.agentId,
      eventType: 'mission_started',
      title: `Mission "${params.title}" lancée`,
      description: `Coût : ${params.cost} crédit${params.cost > 1 ? 's' : ''}.`,
      metadata: { cost_credits: params.cost },
    }),
    logEvent({
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      missionId: params.missionId,
      agentId: params.agentId,
      eventType: 'credits_consumed',
      title: `-${params.cost} crédit${params.cost > 1 ? 's' : ''}`,
      description: `Mission "${params.title}"`,
      metadata: {
        amount: -params.cost,
        new_balance: consume.newBalance,
        transaction_id: consume.transactionId,
      },
    }),
  ])

  return { mission: missionRowToUi(updated), consume }
}

export async function updateMissionStatus(
  missionId: string,
  status: Mission['status'],
): Promise<Mission> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('missions')
    .update({ status: missionStatusToDb(status) })
    .eq('id', missionId)
    .select('*')
    .single()
  if (error) throw error
  return missionRowToUi(data)
}

/**
 * Simulated completion: marks the mission `completed`, stores a placeholder
 * JSON result, flips the agent back to `idle`, logs the event. Swap the
 * `defaultResult` block for a real LLM call when ready.
 */
export async function completeMission(params: {
  missionId: string
  workspaceId: string
  ownerId: string
  agentId: string | null
  title: string
  result?: Record<string, unknown>
}): Promise<Mission> {
  const sb = requireSupabase()

  const defaultResult = {
    summary: `Première analyse générée pour : ${params.title}.`,
    next_steps: [
      "Valider l'hypothèse principale",
      'Choisir un segment cible',
      'Créer une première offre testable',
    ],
    simulated: true,
  }

  const { data, error } = await sb
    .from('missions')
    .update({
      status: 'completed',
      result: params.result ?? defaultResult,
    })
    .eq('id', params.missionId)
    .select('*')
    .single()
  if (error) throw error

  if (params.agentId) {
    await sb
      .from('agents')
      .update({ status: agentStatusToDb('actif') })
      .eq('id', params.agentId)
  }

  await logEvent({
    workspaceId: params.workspaceId,
    ownerId: params.ownerId,
    missionId: params.missionId,
    agentId: params.agentId,
    eventType: 'mission_completed',
    title: `Mission "${params.title}" terminée`,
    description: 'Livrable prêt à valider.',
    metadata: {},
  })

  return missionRowToUi(data)
}
