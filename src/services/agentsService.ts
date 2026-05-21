import { requireSupabase } from '../lib/supabaseClient'
import type { Agent, AgentStatus } from '../lib/types'
import { agentRowToUi, agentStatusToDb } from './mappers'

export async function fetchAgents(workspaceId: string): Promise<Agent[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('agents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(agentRowToUi)
}

export async function updateAgentStatus(agentId: string, status: AgentStatus): Promise<Agent> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('agents')
    .update({ status: agentStatusToDb(status) })
    .eq('id', agentId)
    .select('*')
    .single()
  if (error) throw error
  return agentRowToUi(data)
}
