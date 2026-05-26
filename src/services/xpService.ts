import { requireSupabase } from '../lib/supabaseClient'

export interface AwardXpResult {
  ok: boolean
  newXp: number | null
  newLevel: number | null
  leveledUp: boolean
  error: string | null
}

/**
 * Calls the `award_mission_xp` RPC. The RPC is the only thing that should
 * mutate `agents.xp` / `agents.level` — it locks the row, applies the
 * threshold roll-over, and emits `agent_leveled_up` activity events.
 */
export async function awardMissionXp(params: {
  agentId: string
  xp: number
}): Promise<AwardXpResult> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('award_mission_xp', {
    p_agent_id: params.agentId,
    p_xp: params.xp,
  })
  if (error) {
    return {
      ok: false,
      newXp: null,
      newLevel: null,
      leveledUp: false,
      error: error.message,
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return {
      ok: false,
      newXp: null,
      newLevel: null,
      leveledUp: false,
      error: 'no_response',
    }
  }
  return {
    ok: Boolean(row.ok),
    newXp: row.new_xp ?? null,
    newLevel: row.new_level ?? null,
    leveledUp: Boolean(row.leveled_up),
    error: row.error ?? null,
  }
}
