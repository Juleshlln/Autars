import { requireSupabase } from '../lib/supabaseClient'
import { defaultAgents, seedMissions } from '../v1/data'
import type { MainGoal, Project, ProjectType } from '../lib/types'
import { agentStatusToDb, projectInsertFromUi, workspaceToProject } from './mappers'
import { logEvent } from './activityService'

export async function fetchWorkspaceForUser(userId: string): Promise<Project | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('workspaces')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? workspaceToProject(data) : null
}

export async function createWorkspaceWithDefaults(payload: {
  userId: string
  name: string
  description: string
  projectType: ProjectType
  mainGoal: MainGoal
}): Promise<Project> {
  const sb = requireSupabase()
  const { data: workspace, error } = await sb
    .from('workspaces')
    .insert(projectInsertFromUi(payload))
    .select('*')
    .single()
  if (error) throw error

  // seed agents
  const agentsPayload = defaultAgents.map((a) => ({
    workspace_id: workspace.id,
    owner_id: payload.userId,
    name: a.name,
    role: a.name,
    specialty: a.role,
    status: agentStatusToDb(a.status),
    level: 1,
    xp: 0,
  }))
  const { data: insertedAgents, error: agentsError } = await sb
    .from('agents')
    .insert(agentsPayload)
    .select('*')
  if (agentsError) throw agentsError

  const seedAgentByKey: Record<string, string> = {}
  insertedAgents?.forEach((row, idx) => {
    const key = defaultAgents[idx]?.id
    if (key) seedAgentByKey[key] = row.id
  })

  // seed missions
  if (seedMissions.length) {
    const missionsPayload = seedMissions.map((m) => ({
      workspace_id: workspace.id,
      owner_id: payload.userId,
      agent_id: seedAgentByKey[m.agentId] ?? null,
      title: m.title,
      description: m.description,
      status: 'in_progress' as const,
      priority: 'medium' as const,
    }))
    const { error: missionsError } = await sb.from('missions').insert(missionsPayload)
    if (missionsError) throw missionsError
  }

  await logEvent({
    workspaceId: workspace.id,
    ownerId: payload.userId,
    eventType: 'workspace_updated',
    title: `QG "${payload.name}" créé`,
    description: payload.description?.slice(0, 200) ?? null,
  })

  return workspaceToProject(workspace)
}
