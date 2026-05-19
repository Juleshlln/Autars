export type Theme = 'light' | 'dark'

export type Screen =
  | 'landing'
  | 'scenario'
  | 'briefing'
  | 'generating'
  | 'first-result'
  | 'hq'
  | 'execution'
  | 'report'
  | 'complete'

export type HqTab = 'overview' | 'missions' | 'agents' | 'assets'

export type MissionStatus = 'available' | 'locked' | 'completed'
export type MissionRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary'
export type MissionRisk = 'Low' | 'Medium' | 'High'
export type MissionDifficulty = 'Facile' | 'Intermédiaire' | 'Avancé'
export type AgentDepartment =
  | 'Acquisition'
  | 'Marketing'
  | 'Finance'
  | 'Opérations'
  | 'Support'
  | 'Stratégie'
  | 'Automatisation'

export type Mission = {
  id: string
  index: number
  title: string
  type: string
  reward: string
  output: string
  required?: string
  energyCost: number
  risk: MissionRisk
  rarity: MissionRarity
  description: string
  estimatedTime: string
  expectedResult: string
  difficulty: MissionDifficulty
  impact: string
  assignedAgentIds: string[]
}

export type AgentStatus =
  | 'Ready'
  | 'Working'
  | 'Waiting'
  | 'Complete'
  | 'Blocked'
  | 'Upgrade'
  | 'Result'
  | 'Locked'

export type Agent = {
  id: string
  name: string
  className: string
  role: string
  department: AgentDepartment
  reliability: number
  unlockAfter: number
  level: number
  mission: string
  result: string
  avatar: {
    initials: string
    color: string
    accessory: string
    workspace: string
  }
  personality: string
  skills: string[]
  recommendation: string
  recentHistory: string[]
  stats: Record<string, number>
}

export type VentureBrief = {
  businessIdea: string
  targetCustomer: string
  existingAssets: string
  startingBudget: string
  timePerWeek: string
  mainObjective: string
  currentStage: string
  tone: string
  autonomy: string
}

export type Metrics = {
  marketKnowledge: number
  productClarity: number
  brandStrength: number
  acquisitionPower: number
  traction: number
}

export type CompanyMaturity = {
  overall: number
  acquisition: number
  automation: number
  analysis: number
  content: number
  finance: number
  support: number
}

export type ReportSectionData = { title: string; body: (brief: VentureBrief, ventureName: string) => string }

export type ReportData = {
  missionId: string
  title: string
  subtitle: string
  qualityScore: number
  authors: string
  approveLabel: string
  sections: ReportSectionData[]
  footer?: string[]
}

export type Achievement = {
  id: string
  title: string
  description: string
  unlockAt: number
}
