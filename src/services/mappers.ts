// Map DB rows <-> existing UI types so the rest of the app can stay unchanged.
import type {
  Agent,
  AgentStatus,
  AuthUser,
  MainGoal,
  Mission,
  Project,
  ProjectType,
} from '../lib/types'
import type {
  AgentDbStatus,
  AgentRow,
  MissionDbStatus,
  MissionRow,
  ProfileRow,
  WorkspaceRow,
} from '../lib/database.types'

// ---- agent status ----
const dbToUiStatus: Record<AgentDbStatus, AgentStatus> = {
  idle: 'en attente',
  thinking: 'travaille',
  working: 'travaille',
  waiting_validation: 'actif',
  blocked: 'en attente',
  done: 'actif',
}
const uiToDbStatus: Record<AgentStatus, AgentDbStatus> = {
  'en attente': 'idle',
  travaille: 'working',
  actif: 'done',
}
export const agentStatusToDb = (s: AgentStatus): AgentDbStatus => uiToDbStatus[s]
export const agentStatusFromDb = (s: AgentDbStatus): AgentStatus => dbToUiStatus[s]

// ---- agent icon / accent inferred from role keyword ----
function iconFromRole(role: string): Agent['icon'] {
  const k = role.toLowerCase()
  if (k.includes('strat')) return 'compass'
  if (k.includes('design') || k.includes('build') || k.includes('produit')) return 'builder'
  if (k.includes('growth') || k.includes('market') || k.includes('finance')) return 'growth'
  return 'search'
}
function accentFromRole(role: string): string {
  const k = role.toLowerCase()
  if (k.includes('strat')) return '#6c6ce3'
  if (k.includes('design')) return '#f29d38'
  if (k.includes('growth') || k.includes('market')) return '#40b77a'
  if (k.includes('finance')) return '#1aa6a6'
  return '#1aa6a6'
}

// ---- mission status ----
export function missionStatusFromDb(s: MissionDbStatus): Mission['status'] {
  if (s === 'done' || s === 'completed') return 'terminee'
  if (s === 'in_progress' || s === 'review' || s === 'waiting_user_decision') {
    return 'en cours'
  }
  return 'en attente'
}
export function missionStatusToDb(s: Mission['status']): MissionDbStatus {
  if (s === 'terminee') return 'completed'
  if (s === 'en cours') return 'in_progress'
  return 'todo'
}
function progressFromStatus(s: MissionDbStatus): number {
  if (s === 'done' || s === 'completed') return 100
  if (s === 'review' || s === 'waiting_user_decision') return 80
  if (s === 'in_progress') return 45
  if (s === 'blocked' || s === 'failed') return 20
  return 8
}

// ---- profile / user ----
export function profileToAuthUser(profile: ProfileRow): AuthUser {
  return {
    id: profile.id,
    email: profile.email ?? '',
    name: profile.full_name?.trim() || (profile.email?.split('@')[0] ?? 'Fondateur'),
    createdAt: profile.created_at,
  }
}

// ---- workspace / project ----
// Note: UI Project carries `projectType` + `mainGoal` that the MVP schema does
// not store. We stash them as JSON in `description` so the UI keeps working.
// TODO temporaire: ajouter des colonnes dédiées si on veut filtrer côté DB.
const META_PREFIX = '\n\n<!--AUTARS_META:'
const META_SUFFIX = '-->'

interface ProjectMeta {
  projectType?: ProjectType
  mainGoal?: MainGoal
}

function encodeProjectDescription(desc: string, meta: ProjectMeta): string {
  return `${desc.trim()}${META_PREFIX}${JSON.stringify(meta)}${META_SUFFIX}`
}
function decodeProjectDescription(raw: string | null): { description: string; meta: ProjectMeta } {
  if (!raw) return { description: '', meta: {} }
  const idx = raw.indexOf(META_PREFIX)
  if (idx === -1) return { description: raw, meta: {} }
  const description = raw.slice(0, idx).trim()
  const tail = raw.slice(idx + META_PREFIX.length)
  const close = tail.indexOf(META_SUFFIX)
  if (close === -1) return { description, meta: {} }
  try {
    const meta = JSON.parse(tail.slice(0, close)) as ProjectMeta
    return { description, meta }
  } catch {
    return { description, meta: {} }
  }
}

export function workspaceToProject(row: WorkspaceRow): Project {
  const { description, meta } = decodeProjectDescription(row.description)
  return {
    id: row.id,
    userId: row.owner_id,
    name: row.name,
    description,
    projectType: meta.projectType ?? 'Startup',
    mainGoal: meta.mainGoal ?? 'Clarifier mon idée',
    createdAt: row.created_at,
    level: row.level ?? 1,
    xp: row.xp ?? 0,
    businessScore: row.business_score ?? 0,
  }
}

export function projectInsertFromUi(payload: {
  userId: string
  name: string
  description: string
  projectType: ProjectType
  mainGoal: MainGoal
}) {
  return {
    owner_id: payload.userId,
    name: payload.name,
    description: encodeProjectDescription(payload.description, {
      projectType: payload.projectType,
      mainGoal: payload.mainGoal,
    }),
    stage: 'idea',
  }
}

// ---- agent ----
export function agentRowToUi(row: AgentRow): Agent {
  return {
    id: row.id,
    projectId: row.workspace_id,
    name: row.name,
    role: row.specialty ?? row.role,
    status: agentStatusFromDb(row.status),
    accent: accentFromRole(row.role),
    icon: iconFromRole(row.role),
    exampleMission: row.specialty ?? '',
    createdAt: row.created_at,
  }
}

// ---- mission ----
export function missionRowToUi(row: MissionRow): Mission {
  return {
    id: row.id,
    projectId: row.workspace_id,
    agentId: row.agent_id ?? '',
    title: row.title,
    description: row.description ?? '',
    status: missionStatusFromDb(row.status),
    progress: progressFromStatus(row.status),
    createdAt: row.created_at,
    costCredits: row.cost_credits ?? 1,
    orderIndex: row.order_index,
    xpReward: row.xp_reward ?? 20,
    type: row.type,
    result: (row.result as Mission['result']) ?? null,
  }
}
