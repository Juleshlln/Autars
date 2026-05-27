// =====================================================================
// Agent registry — maps (role, missionType) → AgentMissionDefinition
// =====================================================================

import type { AgentMissionDefinition, AgentMissionType } from './types'
import { STRATEGIST_CLARIFY, STRATEGIST_SCAN } from './strategist'

const REGISTRY: AgentMissionDefinition[] = [STRATEGIST_CLARIFY, STRATEGIST_SCAN]

const BY_TYPE = new Map<AgentMissionType, AgentMissionDefinition>()
for (const def of REGISTRY) BY_TYPE.set(def.missionType, def)

/**
 * Resolve which agent mission to run for a given mission type string from the
 * DB. Falls back to the strategist clarify flow for unknown/null types — that
 * way the user can always "launch" a starter mission and get something useful.
 */
export function resolveAgentMission(missionType: string | null): AgentMissionDefinition {
  if (missionType && BY_TYPE.has(missionType as AgentMissionType)) {
    return BY_TYPE.get(missionType as AgentMissionType) as AgentMissionDefinition
  }
  return STRATEGIST_CLARIFY
}

export { STRATEGIST_CLARIFY, STRATEGIST_SCAN }
export type { AgentMissionDefinition }
export * from './types'
