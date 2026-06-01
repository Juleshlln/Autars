export type ProjectType =
  | 'Startup'
  | 'Freelance / indépendant'
  | 'E-commerce'
  | 'Agence'
  | 'SaaS'
  | 'Service local'
  | 'Autre'

export type MainGoal =
  | 'Clarifier mon idée'
  | 'Créer mon offre'
  | 'Trouver mes premiers clients'
  | 'Construire ma landing page'
  | 'Automatiser mes opérations'
  | 'Structurer mon business plan'

export type AgentStatus = 'actif' | 'en attente' | 'travaille'

export interface AuthUser {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface Project {
  id: string
  userId: string
  name: string
  description: string
  projectType: ProjectType
  mainGoal: MainGoal
  createdAt: string
  // QG progression — real values from `workspaces` (Supabase mode). Default
  // to 1/0/0 in local/demo mode.
  level: number
  xp: number
  businessScore: number
}

export interface Agent {
  id: string
  projectId: string
  name: string
  role: string
  status: AgentStatus
  accent: string
  icon: 'compass' | 'search' | 'builder' | 'growth'
  exampleMission: string
  createdAt: string
}

export interface MissionResult {
  summary?: string
  next_steps?: string[]
  simulated?: boolean
  [key: string]: unknown
}

export interface Mission {
  id: string
  projectId: string
  agentId: string
  title: string
  description: string
  status: 'en cours' | 'en attente' | 'terminee'
  progress: number
  createdAt: string
  costCredits: number
  orderIndex: number | null
  xpReward: number
  type: string | null
  result: MissionResult | null
}

export interface AppSnapshot {
  user: AuthUser | null
  project: Project | null
  agents: Agent[]
  missions: Mission[]
}
