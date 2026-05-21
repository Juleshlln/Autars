import { requireSupabase } from '../lib/supabaseClient'
import type { Mission } from '../lib/types'
import {
  agentStatusToDb,
  missionRowToUi,
  missionStatusToDb,
} from './mappers'
import { logEvent } from './activityService'

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

export async function createMission(payload: {
  workspaceId: string
  agentId: string | null
  ownerId: string
  title: string
  description: string
}): Promise<Mission> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('missions')
    .insert({
      workspace_id: payload.workspaceId,
      agent_id: payload.agentId,
      owner_id: payload.ownerId,
      title: payload.title,
      description: payload.description,
      status: 'in_progress',
      priority: 'medium',
    })
    .select('*')
    .single()
  if (error) throw error

  // Bump agent to "working" so the UI reflects the change.
  if (payload.agentId) {
    await sb
      .from('agents')
      .update({ status: agentStatusToDb('travaille') })
      .eq('id', payload.agentId)
  }

  await logEvent({
    workspaceId: payload.workspaceId,
    ownerId: payload.ownerId,
    agentId: payload.agentId,
    missionId: data.id,
    eventType: 'mission_created',
    title: `Nouvelle mission : ${payload.title}`,
    description: payload.description?.slice(0, 200) || null,
  })

  return missionRowToUi(data)
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
