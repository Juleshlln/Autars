// =====================================================================
// Agent registry — maps (role, missionType) → AgentMissionDefinition
// =====================================================================

import type { AgentMissionDefinition, AgentMissionType } from './types'
import { STRATEGIST_CLARIFY, STRATEGIST_SCAN } from './strategist'
import { MARKDOWN_MISSIONS } from './markdownMissions'

const REGISTRY: AgentMissionDefinition[] = [
  STRATEGIST_CLARIFY,
  STRATEGIST_SCAN,
  ...MARKDOWN_MISSIONS,
]

const BY_TYPE = new Map<AgentMissionType, AgentMissionDefinition>()
for (const def of REGISTRY) BY_TYPE.set(def.missionType, def)

// Aliases: tolerate non-canonical type strings that exist in the DB / older
// seeds so a launch never silently resolves to the wrong deliverable.
const ALIASES: Record<string, AgentMissionType> = {
  clarify: 'clarify-business-idea',
  'business idea': 'clarify-business-idea',
  persona: 'segment',
  'value-proposition': 'value-prop',
  'value proposition': 'value-prop',
  'go-to-market': 'acquisition',
  growth: 'acquisition',
  content: 'content-plan',
  price: 'pricing',
  'business model': 'business-model',
  mvp: 'roadmap',
  brand: 'brand-kit',
}

/**
 * Resolve which agent mission to run for a given mission type string from the
 * DB. Falls back to the strategist clarify flow for unknown/null types — that
 * way the user can always "launch" a starter mission and get something useful.
 */
export function resolveAgentMission(missionType: string | null): AgentMissionDefinition {
  if (missionType) {
    const direct = BY_TYPE.get(missionType as AgentMissionType)
    if (direct) return direct
    const aliased = ALIASES[missionType.toLowerCase().trim()]
    if (aliased && BY_TYPE.has(aliased)) {
      return BY_TYPE.get(aliased) as AgentMissionDefinition
    }
  }
  return STRATEGIST_CLARIFY
}

/** Every mission type the backend can actually fulfil with a dedicated prompt. */
export function supportedMissionTypes(): AgentMissionType[] {
  return Array.from(BY_TYPE.keys())
}

export { STRATEGIST_CLARIFY, STRATEGIST_SCAN }
export type { AgentMissionDefinition }
export * from './types'
