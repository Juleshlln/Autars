import { requireSupabase, supabase } from '../lib/supabaseClient'
import type { ActivityEventRow, ActivityEventType } from '../lib/database.types'

export interface ActivityEvent {
  id: string
  workspaceId: string
  agentId: string | null
  missionId: string | null
  type: ActivityEventType
  title: string
  description: string | null
  createdAt: string
}

function rowToEvent(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    missionId: row.mission_id,
    type: row.event_type,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
  }
}

export async function fetchActivity(
  workspaceId: string,
  limit = 30,
): Promise<ActivityEvent[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('activity_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(rowToEvent)
}

export async function logEvent(payload: {
  workspaceId: string
  ownerId: string
  agentId?: string | null
  missionId?: string | null
  eventType: ActivityEventType
  title: string
  description?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('activity_events').insert({
    workspace_id: payload.workspaceId,
    owner_id: payload.ownerId,
    agent_id: payload.agentId ?? null,
    mission_id: payload.missionId ?? null,
    event_type: payload.eventType,
    title: payload.title,
    description: payload.description ?? null,
    metadata: payload.metadata ?? {},
  })
  if (error) throw error
}

export function subscribeToActivity(
  workspaceId: string,
  onInsert: (event: ActivityEvent) => void,
) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`activity:${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_events',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        onInsert(rowToEvent(payload.new as ActivityEventRow))
      },
    )
    .subscribe()
  return () => {
    void supabase?.removeChannel(channel)
  }
}
