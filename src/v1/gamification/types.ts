export type GamAgentId =
  | 'strategist'
  | 'market'
  | 'branding'
  | 'product'
  | 'pricing'
  | 'landing'
  | 'acquisition'
  | 'sales'
  | 'content'
  | 'analytics'

export type GamAgentStatus =
  | 'idle'
  | 'working'
  | 'waiting_validation'
  | 'completed'
  | 'locked'

export type GamMissionStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'validated'

export type ScoreDimension =
  | 'clarity'
  | 'offer'
  | 'acquisition'
  | 'execution'
  | 'traction'

export type BadgeCategory =
  | 'strategy'
  | 'offer'
  | 'acquisition'
  | 'sales'
  | 'revenue'

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary'

export type AgentIconKey =
  | 'compass'
  | 'search'
  | 'palette'
  | 'package'
  | 'tag'
  | 'layout'
  | 'megaphone'
  | 'handshake'
  | 'pen'
  | 'chart'

export interface HQLevel {
  level: number
  name: string
  description: string
  xpRequired: number
  unlockedFeatures: string[]
  completionCriteria: string[]
}

export interface GamAgent {
  id: GamAgentId
  name: string
  role: string
  level: number
  xp: number
  xpToNextLevel: number
  status: GamAgentStatus
  currentMissionId?: string
  activeSkinId: string
  unlockedSkinIds: string[]
  lastDeliverable?: string
  accent: string
  icon: AgentIconKey
  hqLevelRequired: number
}

export interface GamMission {
  id: string
  title: string
  description: string
  agentId: GamAgentId
  status: GamMissionStatus
  xpReward: number
  expectedDeliverable: string
  unlocks?: string[]
  validationCriteria: string[]
  badgeReward?: string
  hqLevelRequired: number
  dimension: ScoreDimension
}

export interface Badge {
  id: string
  name: string
  description: string
  unlocked: boolean
  unlockCondition: string
  category: BadgeCategory
  icon: AgentIconKey | 'flag' | 'trophy' | 'wallet' | 'rocket' | 'crown'
}

export interface Skin {
  id: string
  name: string
  type: 'agent' | 'hq'
  targetId?: string
  unlocked: boolean
  unlockCondition: string
  rarity: SkinRarity
  description: string
}

export interface DimensionScore {
  dimension: ScoreDimension
  label: string
  value: number
  target: number
}
