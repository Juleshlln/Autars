import { useCallback, useEffect, useMemo, useState } from 'react'
import { badges as seedBadges, gamAgents, gamMissions, hqLevels, skins as seedSkins } from './data'
import { getXpForNextLevel, levelProgress } from '../../lib/gamification/xp'
import type {
  Badge,
  DimensionScore,
  GamAgent,
  GamMission,
  HQLevel,
  ScoreDimension,
  Skin,
} from './types'

interface PersistedState {
  version: number
  xp: number
  missions: Record<string, GamMission['status']>
  badges: Record<string, boolean>
  agents: Record<string, { level: number; xp: number; activeSkinId: string; unlockedSkinIds: string[] }>
  skins: Record<string, boolean>
  activeHQSkinId: string
}

const STATE_VERSION = 1

function storageKey(projectId: string) {
  return `autars:gamification:${projectId}:v${STATE_VERSION}`
}

function defaultPersisted(): PersistedState {
  return {
    version: STATE_VERSION,
    xp: 0,
    missions: Object.fromEntries(gamMissions.map((m) => [m.id, m.status])),
    badges: Object.fromEntries(seedBadges.map((b) => [b.id, b.unlocked])),
    agents: Object.fromEntries(
      gamAgents.map((a) => [
        a.id,
        {
          level: a.level,
          xp: a.xp,
          activeSkinId: a.activeSkinId,
          unlockedSkinIds: [...a.unlockedSkinIds],
        },
      ]),
    ),
    skins: Object.fromEntries(seedSkins.map((s) => [s.id, s.unlocked])),
    activeHQSkinId: 'hq-garage',
  }
}

function loadPersisted(projectId: string): PersistedState {
  if (typeof window === 'undefined') return defaultPersisted()
  try {
    const raw = window.localStorage.getItem(storageKey(projectId))
    if (!raw) return defaultPersisted()
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed.version !== STATE_VERSION) return defaultPersisted()
    return { ...defaultPersisted(), ...parsed }
  } catch {
    return defaultPersisted()
  }
}

function savePersisted(projectId: string, state: PersistedState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state))
  } catch {
    /* quota / unavailable — ignore */
  }
}

function computeHQLevel(xp: number): HQLevel {
  let current = hqLevels[0]
  for (const level of hqLevels) {
    if (xp >= level.xpRequired) current = level
  }
  return current
}

function nextHQLevel(currentLevel: number): HQLevel | null {
  return hqLevels.find((l) => l.level === currentLevel + 1) ?? null
}

// Descriptor (name/features) for a real backend level. Clamps to the last
// defined tier when the QG level exceeds the seeded `hqLevels` table.
function hqLevelDescriptor(level: number): HQLevel {
  const exact = hqLevels.find((l) => l.level === level)
  if (exact) return exact
  const last = hqLevels[hqLevels.length - 1]
  return level > last.level ? { ...last, level } : hqLevels[0]
}

function xpForAgentLevel(level: number) {
  return [0, 100, 250, 500, 900, 1500][Math.min(level - 1, 5)] ?? 1500
}

function agentLevelFromXP(xp: number) {
  let level = 1
  for (let i = 1; i <= 5; i += 1) {
    if (xp >= xpForAgentLevel(i)) level = i
  }
  return level
}

const dimensionLabels: Record<ScoreDimension, string> = {
  clarity: 'Clarté',
  offer: 'Offre',
  acquisition: 'Acquisition',
  execution: 'Exécution',
  traction: 'Traction',
}

export interface GamificationApi {
  hqLevel: HQLevel
  nextLevel: HQLevel | null
  xp: number
  xpForCurrentLevel: number
  xpForNextLevel: number | null
  xpProgressInLevel: number
  scoreBusiness: number
  dimensionScores: DimensionScore[]
  missions: GamMission[]
  agents: GamAgent[]
  badges: Badge[]
  skins: Skin[]
  activeHQSkinId: string
  nextBestMission: GamMission | null
  startMission: (id: string) => void
  completeMission: (id: string) => void
  validateMission: (id: string) => void
  selectAgentSkin: (agentId: string, skinId: string) => void
  selectHQSkin: (skinId: string) => void
  resetProgress: () => void
}

export function useGamification(
  projectId: string,
  realHq?: { level: number; xp: number },
): GamificationApi {
  const [persisted, setPersisted] = useState<PersistedState>(() => loadPersisted(projectId))

  // Reload persisted state when the active project changes. This is React's
  // documented "adjust state during render" pattern (a state sentinel, not an
  // effect) — it avoids the cascading render an effect would cause.
  const [lastProjectId, setLastProjectId] = useState(projectId)
  if (lastProjectId !== projectId) {
    setLastProjectId(projectId)
    setPersisted(loadPersisted(projectId))
  }

  useEffect(() => {
    savePersisted(projectId, persisted)
  }, [projectId, persisted])

  // Local mini-game level — drives mission/badge/skin gating (unchanged).
  const localHqLevel = useMemo(() => computeHQLevel(persisted.xp), [persisted.xp])

  // Headline level/XP: in Supabase mode it reflects the REAL backend QG
  // progression (workspaces.level/xp); in local/demo mode it falls back to the
  // local mini-game progression so the offline experience is unchanged.
  const hqLevel: HQLevel = realHq ? hqLevelDescriptor(realHq.level) : localHqLevel
  const nextLevel: HQLevel | null = nextHQLevel(
    realHq ? realHq.level : localHqLevel.level,
  )

  const missions = useMemo<GamMission[]>(
    () =>
      gamMissions.map((mission) => {
        const stored = persisted.missions[mission.id] ?? mission.status
        const finalStatus: GamMission['status'] =
          stored === 'available' && localHqLevel.level < mission.hqLevelRequired
            ? 'locked'
            : stored
        return { ...mission, status: finalStatus }
      }),
    [persisted.missions, localHqLevel.level],
  )

  const badges = useMemo<Badge[]>(
    () =>
      seedBadges.map((badge) => ({ ...badge, unlocked: persisted.badges[badge.id] ?? false })),
    [persisted.badges],
  )

  const skins = useMemo<Skin[]>(
    () => seedSkins.map((skin) => ({ ...skin, unlocked: persisted.skins[skin.id] ?? skin.unlocked })),
    [persisted.skins],
  )

  const agents = useMemo<GamAgent[]>(
    () =>
      gamAgents.map((agent) => {
        const persistedAgent = persisted.agents[agent.id]
        const xp = persistedAgent?.xp ?? agent.xp
        const level = agentLevelFromXP(xp)
        const xpToNextLevel = xpForAgentLevel(level + 1) - xp
        const unlocked = hqLevel.level >= agent.hqLevelRequired
        const status: GamAgent['status'] = unlocked
          ? missions.some((m) => m.agentId === agent.id && m.status === 'in_progress')
            ? 'working'
            : missions.some((m) => m.agentId === agent.id && m.status === 'completed')
              ? 'waiting_validation'
              : missions.some((m) => m.agentId === agent.id && m.status === 'available')
                ? 'idle'
                : 'completed'
          : 'locked'
        const currentMission = missions.find(
          (m) => m.agentId === agent.id && (m.status === 'in_progress' || m.status === 'available'),
        )
        return {
          ...agent,
          level,
          xp,
          xpToNextLevel: Math.max(0, xpToNextLevel),
          status,
          currentMissionId: currentMission?.id,
          activeSkinId: persistedAgent?.activeSkinId ?? agent.activeSkinId,
          unlockedSkinIds: persistedAgent?.unlockedSkinIds ?? agent.unlockedSkinIds,
        }
      }),
    [persisted.agents, hqLevel.level, missions],
  )

  const dimensionScores = useMemo<DimensionScore[]>(() => {
    const dims: ScoreDimension[] = ['clarity', 'offer', 'acquisition', 'execution', 'traction']
    const totalCount = gamMissions.length
    const doneCount = Object.values(persisted.missions).filter(
      (s) => s === 'completed' || s === 'validated',
    ).length
    return dims.map((dim) => {
      if (dim === 'execution') {
        return {
          dimension: dim,
          label: dimensionLabels[dim],
          value: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100),
          target: 100,
        }
      }
      const inDim = gamMissions.filter((m) => m.dimension === dim)
      const target = inDim.reduce((sum, m) => sum + m.xpReward, 0)
      if (target === 0) {
        return { dimension: dim, label: dimensionLabels[dim], value: 0, target: 100 }
      }
      const value = inDim
        .filter((m) => {
          const status = persisted.missions[m.id]
          return status === 'completed' || status === 'validated'
        })
        .reduce((sum, m) => sum + m.xpReward, 0)
      return {
        dimension: dim,
        label: dimensionLabels[dim],
        value: Math.min(100, Math.round((value / target) * 100)),
        target: 100,
      }
    })
  }, [persisted.missions])

  const scoreBusiness = useMemo(() => {
    if (dimensionScores.length === 0) return 0
    const sum = dimensionScores.reduce((acc, d) => acc + d.value, 0)
    return Math.round(sum / dimensionScores.length)
  }, [dimensionScores])

  const xp = realHq ? realHq.xp : persisted.xp
  const xpForCurrentLevel = realHq ? 0 : hqLevel.xpRequired
  const xpForNextLevel = realHq
    ? getXpForNextLevel(realHq.level, 'hq')
    : (nextLevel?.xpRequired ?? null)
  const xpProgressInLevel = realHq
    ? Math.round(levelProgress(realHq.xp, realHq.level, 'hq') * 100)
    : xpForNextLevel
      ? Math.min(
          100,
          Math.round(
            ((persisted.xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100,
          ),
        )
      : 100

  const nextBestMission = useMemo<GamMission | null>(() => {
    const available = missions.find((m) => m.status === 'available' && m.hqLevelRequired <= hqLevel.level)
    const inProgress = missions.find((m) => m.status === 'in_progress')
    return inProgress ?? available ?? null
  }, [missions, hqLevel.level])

  const startMission = useCallback((id: string) => {
    setPersisted((prev) => {
      const status = prev.missions[id]
      if (status !== 'available') return prev
      return { ...prev, missions: { ...prev.missions, [id]: 'in_progress' } }
    })
  }, [])

  const completeMission = useCallback((id: string) => {
    setPersisted((prev) => {
      const status = prev.missions[id]
      if (status !== 'in_progress' && status !== 'available') return prev
      return { ...prev, missions: { ...prev.missions, [id]: 'completed' } }
    })
  }, [])

  const validateMission = useCallback((id: string) => {
    setPersisted((prev) => {
      const status = prev.missions[id]
      if (status === 'validated' || status === 'locked') return prev
      const mission = gamMissions.find((m) => m.id === id)
      if (!mission) return prev

      const nextMissions = { ...prev.missions, [id]: 'validated' as const }
      for (const unlockId of mission.unlocks ?? []) {
        if (nextMissions[unlockId] === 'locked') {
          nextMissions[unlockId] = 'available'
        }
      }

      const nextBadges = { ...prev.badges }
      if (mission.badgeReward) nextBadges[mission.badgeReward] = true

      const agentPersist = prev.agents[mission.agentId] ?? {
        level: 1,
        xp: 0,
        activeSkinId: 'agent-default',
        unlockedSkinIds: ['agent-default'],
      }
      const nextAgents = {
        ...prev.agents,
        [mission.agentId]: { ...agentPersist, xp: agentPersist.xp + Math.round(mission.xpReward / 5) },
      }

      const nextXP = prev.xp + mission.xpReward
      const nextSkins = { ...prev.skins }
      const newHQLevel = computeHQLevel(nextXP).level
      for (const skin of seedSkins) {
        if (skin.type === 'hq' && skin.targetId && Number(skin.targetId) <= newHQLevel) {
          nextSkins[skin.id] = true
        }
      }
      if (mission.id === 'm13-first-client') nextSkins['skin-sales-closer'] = true
      if (mission.id === 'm14-first-payment') nextSkins['skin-pricing-finance'] = true
      if (mission.id === 'm5-offer') nextSkins['skin-product-architect'] = true

      return {
        ...prev,
        xp: nextXP,
        missions: nextMissions,
        badges: nextBadges,
        agents: nextAgents,
        skins: nextSkins,
      }
    })
  }, [])

  const selectAgentSkin = useCallback((agentId: string, skinId: string) => {
    setPersisted((prev) => {
      const agent = prev.agents[agentId]
      if (!agent || !agent.unlockedSkinIds.includes(skinId)) return prev
      return {
        ...prev,
        agents: { ...prev.agents, [agentId]: { ...agent, activeSkinId: skinId } },
      }
    })
  }, [])

  const selectHQSkin = useCallback((skinId: string) => {
    setPersisted((prev) => {
      if (!prev.skins[skinId]) return prev
      return { ...prev, activeHQSkinId: skinId }
    })
  }, [])

  const resetProgress = useCallback(() => {
    setPersisted(defaultPersisted())
  }, [])

  return {
    hqLevel,
    nextLevel,
    xp,
    xpForCurrentLevel,
    xpForNextLevel,
    xpProgressInLevel,
    scoreBusiness,
    dimensionScores,
    missions,
    agents,
    badges,
    skins,
    activeHQSkinId: persisted.activeHQSkinId,
    nextBestMission,
    startMission,
    completeMission,
    validateMission,
    selectAgentSkin,
    selectHQSkin,
    resetProgress,
  }
}
