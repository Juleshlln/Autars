import { requireSupabase } from '../lib/supabaseClient'
import type { Agent, MainGoal, Project, ProjectType } from '../lib/types'
import {
  agentStatusToDb,
  projectInsertFromUi,
  workspaceToProject,
} from './mappers'
import { logEvent } from './activityService'

// Starter pack aligned with the product brief. Icons + accents are derived
// from the role keyword by the mappers (no UI change needed).
interface StarterAgent {
  name: string
  role: string
  specialty: string
}
const STARTER_AGENTS: StarterAgent[] = [
  {
    name: 'Stratège',
    role: 'Stratégie business',
    specialty: "Clarification d'idée, positionnement, modèle économique",
  },
  {
    name: 'Builder',
    role: 'Construction produit',
    specialty: 'Landing page, MVP, structure produit',
  },
  {
    name: 'Growth',
    role: 'Acquisition',
    specialty: 'Contenu, canaux, premiers clients',
  },
  {
    name: 'Finance',
    role: 'Business model',
    specialty: 'Pricing, coûts, rentabilité',
  },
]

interface StarterMission {
  title: string
  description: string
  agentName: string
  type: string
}
// Each starter mission maps to a dedicated backend mission definition
// (server/agents/*) so it produces a real, role-specific deliverable —
// never a generic "clarification". Types MUST match the registry keys.
// Missions are seeded as `todo` and only debit a credit when launched, so
// listing more of them costs the user nothing up-front.
const STARTER_MISSIONS: StarterMission[] = [
  // --- Stratège ---
  {
    title: "Clarifier l'idée business",
    description: 'Reformuler le problème, la cible et la promesse en une page.',
    agentName: 'Stratège',
    type: 'clarify-business-idea',
  },
  {
    title: 'Définir le client cible',
    description: 'Choisir un segment prioritaire et formaliser le persona principal.',
    agentName: 'Stratège',
    type: 'segment',
  },
  {
    title: 'Construire la proposition de valeur',
    description: 'Promesse claire, différenciateurs et preuves à mettre en avant.',
    agentName: 'Stratège',
    type: 'value-prop',
  },
  {
    title: 'Définir le positionnement',
    description: 'Catégorie de marché et messages clés (framework April Dunford).',
    agentName: 'Stratège',
    type: 'positioning',
  },
  // --- Builder ---
  {
    title: 'Imaginer une première offre monétisable',
    description: 'Livrables, format et prix de départ pour générer du chiffre vite.',
    agentName: 'Builder',
    type: 'offer',
  },
  {
    title: 'Préparer une première landing page',
    description: 'Wireframe + copie d’une page simple orientée conversion.',
    agentName: 'Builder',
    type: 'landing',
  },
  {
    title: 'Construire la roadmap MVP',
    description: 'Périmètre v1, ce qu’on exclut, et 3 jalons de build.',
    agentName: 'Builder',
    type: 'roadmap',
  },
  // --- Growth ---
  {
    title: "Définir un plan d'acquisition initial",
    description: 'Choisir 2 canaux prioritaires, rédiger les messages, fixer les métriques.',
    agentName: 'Growth',
    type: 'acquisition',
  },
  {
    title: 'Créer un plan de contenu 7 jours',
    description: 'Calendrier éditorial prêt à publier sur une semaine.',
    agentName: 'Growth',
    type: 'content-plan',
  },
  // --- Finance ---
  {
    title: 'Définir le pricing',
    description: 'Grille tarifaire défendable, ancrage et tests de willingness-to-pay.',
    agentName: 'Finance',
    type: 'pricing',
  },
  {
    title: 'Construire le business model',
    description: 'Sources de revenus, structure de coûts et boucle de croissance.',
    agentName: 'Finance',
    type: 'business-model',
  },
]

export async function fetchWorkspaceForUser(userId: string): Promise<Project | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('workspaces')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? workspaceToProject(data) : null
}

export async function createWorkspaceWithDefaults(payload: {
  userId: string
  name: string
  description: string
  projectType: ProjectType
  mainGoal: MainGoal
}): Promise<Project> {
  const sb = requireSupabase()

  // 1. workspace
  const { data: workspace, error } = await sb
    .from('workspaces')
    .insert(projectInsertFromUi(payload))
    .select('*')
    .single()
  if (error) throw error

  // 2. agents
  const agentsPayload = STARTER_AGENTS.map((a) => ({
    workspace_id: workspace.id,
    owner_id: payload.userId,
    name: a.name,
    role: a.role,
    specialty: a.specialty,
    status: agentStatusToDb('en attente'),
    level: 1,
    xp: 0,
  }))
  const { data: insertedAgents, error: agentsError } = await sb
    .from('agents')
    .insert(agentsPayload)
    .select('*')
  if (agentsError) throw agentsError

  const agentByName = new Map<string, string>()
  insertedAgents?.forEach((row) => agentByName.set(row.name, row.id))

  // 3. starter missions — free initial content, status 'todo', 1 credit each
  const missionsPayload = STARTER_MISSIONS.map((m, idx) => ({
    workspace_id: workspace.id,
    owner_id: payload.userId,
    agent_id: agentByName.get(m.agentName) ?? null,
    title: m.title,
    description: m.description,
    status: 'todo' as const,
    priority: 'medium' as const,
    cost_credits: 1,
    type: m.type,
    order_index: idx + 1,
    xp_reward: 20,
  }))
  if (missionsPayload.length) {
    const { error: missionsError } = await sb.from('missions').insert(missionsPayload)
    if (missionsError) throw missionsError
  }

  // 4. activity events
  await logEvent({
    workspaceId: workspace.id,
    ownerId: payload.userId,
    eventType: 'workspace_created',
    title: `QG "${payload.name}" créé`,
    description: payload.description?.slice(0, 200) ?? null,
  })

  if (insertedAgents?.length) {
    const eventRows = insertedAgents.map((row) => ({
      workspace_id: workspace.id,
      owner_id: payload.userId,
      agent_id: row.id,
      event_type: 'agent_created' as const,
      title: `${row.name} activé`,
      description: row.specialty,
      metadata: {},
    }))
    await sb.from('activity_events').insert(eventRows)
  }

  return workspaceToProject(workspace)
}

// Fallback used by useAutarsBackend in local mode.
export function starterAgentsForProject(projectId: string): Agent[] {
  const accent: Record<string, string> = {
    Stratège: '#6c6ce3',
    Builder: '#f29d38',
    Growth: '#40b77a',
    Finance: '#1aa6a6',
  }
  const icon: Record<string, Agent['icon']> = {
    Stratège: 'compass',
    Builder: 'builder',
    Growth: 'growth',
    Finance: 'search',
  }
  return STARTER_AGENTS.map((a, idx) => ({
    id: `${projectId}:${a.name.toLowerCase()}-${idx}`,
    projectId,
    name: a.name,
    role: a.specialty,
    status: 'en attente',
    accent: accent[a.name] ?? '#6c6ce3',
    icon: icon[a.name] ?? 'compass',
    exampleMission: a.specialty,
    createdAt: new Date().toISOString(),
  }))
}
