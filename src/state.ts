import type { Agent, AgentStatus, CompanyMaturity, Metrics, Mission, MissionStatus } from './types'
import { agents as baseAgents, missions as baseMissions } from './data'

/**
 * `step` représente le nombre d'étapes complétées (0..7).
 * Toute la progression du venture en découle.
 */

export function getMissions(): Mission[] {
  return baseMissions.map((m) => ({ ...m }))
}

export function getMissionStatus(mission: Mission, step: number): MissionStatus {
  if (mission.index <= step) return 'completed'
  if (mission.index === step + 1) return 'available'
  return 'locked'
}

export function getAgents(step: number): Array<Agent & {
  status: AgentStatus
  progress: number
  activeMission?: Mission
  unlock?: string
}> {
  return baseAgents.map((agent) => {
    if (step < agent.unlockAfter) {
      const blocker = baseMissions[agent.unlockAfter - 1]
      return {
        ...agent,
        status: 'Locked' as AgentStatus,
        progress: 0,
        unlock: blocker ? `Débloqué après "${blocker.title}"` : 'Débloqué plus tard',
      }
    }

    const activeMission = baseMissions.find(
      (mission) => mission.index === step + 1 && mission.assignedAgentIds.includes(agent.id),
    )
    const completedAssignments = baseMissions.filter(
      (mission) => mission.index <= step && mission.assignedAgentIds.includes(agent.id),
    )

    if (activeMission) {
      const progress = Math.min(92, 34 + step * 8 + activeMission.energyCost)
      return { ...agent, status: 'Working' as AgentStatus, progress, activeMission }
    }

    if (completedAssignments.length > 0) {
      const last = completedAssignments[completedAssignments.length - 1]
      const status: AgentStatus = last.index === step ? 'Result' : 'Complete'
      return { ...agent, status, progress: 100, activeMission: last }
    }

    return { ...agent, status: 'Ready' as AgentStatus, progress: 0 }
  })
}

export function computeMetrics(step: number): Metrics {
  const table: Metrics[] = [
    { marketKnowledge: 5, productClarity: 10, brandStrength: 0, acquisitionPower: 0, traction: 0 },
    { marketKnowledge: 30, productClarity: 15, brandStrength: 0, acquisitionPower: 0, traction: 0 },
    { marketKnowledge: 35, productClarity: 45, brandStrength: 10, acquisitionPower: 0, traction: 0 },
    { marketKnowledge: 35, productClarity: 72, brandStrength: 18, acquisitionPower: 8, traction: 0 },
    { marketKnowledge: 35, productClarity: 76, brandStrength: 48, acquisitionPower: 12, traction: 0 },
    { marketKnowledge: 38, productClarity: 82, brandStrength: 56, acquisitionPower: 28, traction: 0 },
    { marketKnowledge: 42, productClarity: 84, brandStrength: 58, acquisitionPower: 62, traction: 0 },
    { marketKnowledge: 46, productClarity: 86, brandStrength: 60, acquisitionPower: 74, traction: 12 },
  ]
  return table[Math.min(step, table.length - 1)]!
}

export function computeXP(step: number): number {
  const table = [0, 120, 260, 430, 560, 720, 870, 1040]
  return table[Math.min(step, table.length - 1)]!
}

export function computeEnergy(step: number): number {
  const table = [100, 92, 84, 76, 70, 62, 56, 52]
  return table[Math.min(step, table.length - 1)]!
}

export function computeStageLabel(step: number): string {
  const labels = [
    'Idée',
    'Opportunité validée',
    'Positionnement défini',
    'Offre packagée',
    'Direction de marque',
    'Landing page prête',
    "Plan d'acquisition prêt",
    'Test de lancement prêt',
  ]
  return labels[Math.min(step, labels.length - 1)]!
}

export function computeAssetsCount(step: number): number {
  return step
}

export function computeCompanyMaturity(step: number): CompanyMaturity {
  const metrics = computeMetrics(step)
  const acquisition = Math.min(100, metrics.acquisitionPower + (step >= 6 ? 16 : 4))
  const automation = Math.min(100, 12 + step * 9)
  const analysis = Math.min(100, metrics.marketKnowledge + 18)
  const content = Math.min(100, metrics.brandStrength + (step >= 5 ? 18 : 8))
  const finance = Math.min(100, metrics.productClarity + (step >= 3 ? 12 : 2))
  const support = Math.min(100, 10 + step * 7)
  const overall = Math.round((acquisition + automation + analysis + content + finance + support) / 6)

  return {
    overall,
    acquisition,
    automation,
    analysis,
    content,
    finance,
    support,
  }
}

export function computeFounderLevel(step: number): number {
  // 7 missions → niveaux 1..5 (1 à l'idée, 5 au lancement)
  if (step <= 0) return 1
  if (step <= 1) return 2
  if (step <= 3) return 3
  if (step <= 5) return 4
  return 5
}

export function levelLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'Solo Builder',
    2: 'Micro-entreprise IA',
    3: 'Équipe automatisée',
    4: 'Business System',
    5: 'Autonomous Company',
  }
  return labels[level] ?? 'Solo Builder'
}
