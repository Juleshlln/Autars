// =====================================================================
// Deliverables service (frontend)
// =====================================================================

import { requireSupabase, supabase } from '../lib/supabaseClient'

export type DeliverableStatus =
  | 'draft'
  | 'pending_validation'
  | 'validated'
  | 'needs_improvement'
  | 'rejected'
  | 'archived'

export interface DeliverableRow {
  id: string
  workspaceId: string
  missionId: string
  agentRunId: string | null
  previousVersionId: string | null
  agentId: string | null
  title: string
  type: string
  content: string | null
  structuredContent: Record<string, unknown>
  version: number
  status: DeliverableStatus
  createdAt: string
  updatedAt: string
}

interface RawRow {
  id: string
  workspace_id: string
  mission_id: string
  agent_run_id: string | null
  previous_version_id: string | null
  agent_id: string | null
  title: string
  type: string
  content: string | null
  structured_content: Record<string, unknown> | null
  version: number
  status: DeliverableStatus
  created_at: string
  updated_at: string
}

function toUi(row: RawRow): DeliverableRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    missionId: row.mission_id,
    agentRunId: row.agent_run_id,
    previousVersionId: row.previous_version_id,
    agentId: row.agent_id,
    title: row.title,
    type: row.type,
    content: row.content,
    structuredContent: row.structured_content ?? {},
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchDeliverable(id: string): Promise<DeliverableRow | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('deliverables')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toUi(data as RawRow) : null
}

export async function fetchLatestDeliverableForMission(
  missionId: string,
): Promise<DeliverableRow | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? toUi(data as RawRow) : null
}

export async function fetchDeliverablesForWorkspace(
  workspaceId: string,
  limit = 50,
): Promise<DeliverableRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('deliverables')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => toUi(row as RawRow))
}

export function subscribeToDeliverables(
  workspaceId: string,
  onChange: (row: DeliverableRow) => void,
) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`deliverables:${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'deliverables',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as RawRow | null
        if (row) onChange(toUi(row))
      },
    )
    .subscribe()
  return () => {
    void supabase?.removeChannel(channel)
  }
}
