// =====================================================================
// Backend → gamification adapter
// =====================================================================
// Maps the REAL backend data (Mission[] / DeliverableRow[] / Agent[]) into the
// shapes the gamification components expect (GamMission[] / GamAgent[]), so the
// gamified "roadmap" becomes a visual overlay of the real missions instead of a
// parallel localStorage mini-game. The components themselves are unchanged.
// =====================================================================

import type { Agent, Mission } from '../../lib/types'
import type { DeliverableRow } from '../../services/deliverablesService'
import type {
  AgentIconKey,
  Badge,
  BadgeCategory,
  DimensionScore,
  GamAgent,
  GamAgentStatus,
  GamMission,
  GamMissionStatus,
  ScoreDimension,
} from './types'

const ICON_MAP: Record<Agent['icon'], AgentIconKey> = {
  compass: 'compass',
  search: 'search',
  builder: 'package',
  growth: 'megaphone',
}

const AGENT_STATUS_MAP: Record<Agent['status'], GamAgentStatus> = {
  'en attente': 'idle',
  travaille: 'working',
  actif: 'completed',
}

export function toGamAgents(agents: Agent[]): GamAgent[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    status: AGENT_STATUS_MAP[a.status] ?? 'idle',
    activeSkinId: 'agent-default',
    unlockedSkinIds: [],
    accent: a.accent,
    icon: ICON_MAP[a.icon] ?? 'compass',
    hqLevelRequired: 1,
  }))
}

function dimensionForType(type: string | null): ScoreDimension {
  switch (type) {
    case 'clarify-business-idea':
    case 'segment':
    case 'value-prop':
    case 'positioning':
      return 'clarity'
    case 'offer':
    case 'pricing':
    case 'business-model':
      return 'offer'
    case 'landing':
    case 'acquisition':
    case 'content-plan':
    case 'brand-kit':
      return 'acquisition'
    case 'roadmap':
      return 'execution'
    default:
      return 'execution'
  }
}

const DELIVERABLE_LABEL: Record<string, string> = {
  'clarify-business-idea': 'Clarification business',
  scan: "Rapport d'opportunité",
  segment: 'Persona client',
  'value-prop': 'Proposition de valeur',
  positioning: 'Positionnement',
  'business-model': 'Business model',
  offer: 'Première offre',
  landing: 'Landing page',
  roadmap: 'Roadmap MVP',
  'brand-kit': 'Kit de marque',
  acquisition: "Plan d'acquisition",
  'content-plan': 'Plan de contenu 7j',
  pricing: 'Pricing',
}

function isPending(d: DeliverableRow | undefined): boolean {
  return !!d && (d.status === 'pending_validation' || d.status === 'needs_improvement')
}

/**
 * Real mission (+ its latest deliverable) → gamified status.
 * available → in_progress → completed (deliverable awaiting validation) → validated.
 */
export function gamStatusFor(
  mission: Mission,
  deliverable: DeliverableRow | undefined,
): GamMissionStatus {
  if (mission.status === 'terminee') return 'validated'
  if (deliverable?.status === 'validated') return 'validated'
  if (isPending(deliverable)) return 'completed'
  if (mission.status === 'en cours') return 'in_progress'
  return 'available'
}

export function toGamMissions(
  missions: Mission[],
  deliverableByMission: Map<string, DeliverableRow>,
): GamMission[] {
  return [...missions]
    .sort((a, b) => (a.orderIndex ?? 9999) - (b.orderIndex ?? 9999))
    .map((m) => {
      const deliverable = deliverableByMission.get(m.id)
      const summary =
        m.result && typeof m.result.summary === 'string' ? m.result.summary : null
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        agentId: m.agentId,
        status: gamStatusFor(m, deliverable),
        xpReward: m.xpReward ?? 20,
        expectedDeliverable: DELIVERABLE_LABEL[m.type ?? ''] ?? 'Livrable',
        validationCriteria: summary
          ? [summary]
          : ["Livrable généré par l'agent", 'À relire et valider par le fondateur'],
        hqLevelRequired: 1,
        dimension: dimensionForType(m.type),
      }
    })
}

/** The next mission to LAUNCH, surfaced in the "Mission recommandée" card.
 *  (Deliverables awaiting validation are actioned from the roadmap itself, so
 *  this card only recommends a launchable mission.) */
export function pickNextBestMission(gamMissions: GamMission[]): GamMission | null {
  return gamMissions.find((m) => m.status === 'available') ?? null
}

// ---------------------------------------------------------------------
// Business score + badges, derived from REAL mission completion
// ---------------------------------------------------------------------
const DIM_LABEL: Record<ScoreDimension, string> = {
  clarity: 'Clarté',
  offer: 'Offre',
  acquisition: 'Acquisition',
  execution: 'Exécution',
  traction: 'Traction',
}

/** Each dimension = % of its missions validated. `execution` = overall ratio. */
export function computeDimensionScores(gamMissions: GamMission[]): DimensionScore[] {
  const dims: ScoreDimension[] = ['clarity', 'offer', 'acquisition', 'execution', 'traction']
  const total = gamMissions.length
  const validatedTotal = gamMissions.filter((m) => m.status === 'validated').length
  return dims.map((dim) => {
    if (dim === 'execution') {
      return {
        dimension: dim,
        label: DIM_LABEL[dim],
        value: total === 0 ? 0 : Math.round((validatedTotal / total) * 100),
        target: 100,
      }
    }
    const inDim = gamMissions.filter((m) => m.dimension === dim)
    const validated = inDim.filter((m) => m.status === 'validated').length
    return {
      dimension: dim,
      label: DIM_LABEL[dim],
      value: inDim.length === 0 ? 0 : Math.round((validated / inDim.length) * 100),
      target: 100,
    }
  })
}

const CATEGORY_DIMENSION: Record<BadgeCategory, ScoreDimension> = {
  strategy: 'clarity',
  offer: 'offer',
  acquisition: 'acquisition',
  sales: 'acquisition',
  revenue: 'execution',
}

/**
 * Unlock badges from real progress: within each dimension, the first N badges
 * unlock where N = number of validated missions in that dimension (seed order).
 * Honest signal — a badge means "you validated a mission in this area".
 */
export function computeBadges(gamMissions: GamMission[], seed: Badge[]): Badge[] {
  const validatedByDim = new Map<ScoreDimension, number>()
  for (const m of gamMissions) {
    if (m.status === 'validated') {
      validatedByDim.set(m.dimension, (validatedByDim.get(m.dimension) ?? 0) + 1)
    }
  }
  const usedByDim = new Map<ScoreDimension, number>()
  return seed.map((badge) => {
    const dim = CATEGORY_DIMENSION[badge.category]
    const used = usedByDim.get(dim) ?? 0
    const unlocked = used < (validatedByDim.get(dim) ?? 0)
    usedByDim.set(dim, used + 1)
    return { ...badge, unlocked }
  })
}
