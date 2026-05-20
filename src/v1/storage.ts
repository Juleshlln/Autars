import { defaultAgents, seedMissions } from './data'
import type {
  Agent,
  AppSnapshot,
  AuthUser,
  MainGoal,
  Mission,
  Project,
  ProjectType,
} from '../lib/types'

const SNAPSHOT_KEY = 'autars:v1:snapshot'

const emptySnapshot: AppSnapshot = {
  user: null,
  project: null,
  agents: [],
  missions: [],
}

export function loadSnapshot(): AppSnapshot {
  if (typeof window === 'undefined') return emptySnapshot
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return emptySnapshot
    const parsed = JSON.parse(raw) as AppSnapshot
    return {
      user: parsed.user ?? null,
      project: parsed.project ?? null,
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      missions: Array.isArray(parsed.missions) ? parsed.missions : [],
    }
  } catch {
    return emptySnapshot
  }
}

export function saveSnapshot(snapshot: AppSnapshot) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export function createLocalUser(email: string): AuthUser {
  const now = new Date().toISOString()
  const prefix = email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Fondateur'
  const name = prefix
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return {
    id: crypto.randomUUID(),
    email,
    name: name || 'Fondateur Autars',
    createdAt: now,
  }
}

export function createProjectPayload({
  userId,
  name,
  description,
  projectType,
  mainGoal,
}: {
  userId: string
  name: string
  description: string
  projectType: ProjectType
  mainGoal: MainGoal
}): { project: Project; agents: Agent[]; missions: Mission[] } {
  const now = new Date().toISOString()
  const projectId = crypto.randomUUID()
  const agents = defaultAgents.map((agent) => ({
    ...agent,
    projectId,
    createdAt: now,
  }))

  const missions = seedMissions.map((mission) => ({
    id: crypto.randomUUID(),
    projectId,
    agentId: mission.agentId,
    title: mission.title,
    description: mission.description,
    status: 'en cours' as const,
    progress: mission.progress,
    createdAt: now,
  }))

  return {
    project: {
      id: projectId,
      userId,
      name,
      description,
      projectType,
      mainGoal,
      createdAt: now,
    },
    agents,
    missions,
  }
}

export function createMissionPayload({
  projectId,
  agentId,
  title,
  description,
}: {
  projectId: string
  agentId: string
  title: string
  description: string
}): Mission {
  return {
    id: crypto.randomUUID(),
    projectId,
    agentId,
    title,
    description,
    status: 'en cours',
    progress: 12,
    createdAt: new Date().toISOString(),
  }
}
