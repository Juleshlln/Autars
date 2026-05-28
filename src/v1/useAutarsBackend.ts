import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import type { Agent, AuthUser, MainGoal, Mission, Project, ProjectType } from '../lib/types'
import {
  getCurrentUser,
  onAuthChange,
  signInWithPassword,
  signOut as supabaseSignOut,
  signUpWithPassword,
} from '../services/authService'
import { fetchAgents } from '../services/agentsService'
import {
  createMission as supabaseCreateMission,
  fetchMissions,
  InsufficientCreditsError,
} from '../services/missionsService'
import {
  createWorkspaceWithDefaults,
  fetchWorkspaceForUser,
} from '../services/workspacesService'
import {
  fetchActivity,
  subscribeToActivity,
  type ActivityEvent,
} from '../services/activityService'
import {
  fetchActiveSubscription,
  fetchPlan,
  fetchWallet,
  type CreditWallet,
  type Plan,
  type Subscription,
} from '../services/creditsService'
import {
  fetchDeliverablesForWorkspace,
  subscribeToDeliverables,
  type DeliverableRow,
} from '../services/deliverablesService'
import {
  AgentRunAlreadyActiveError,
  AgentRunFailedError,
  AgentRunInsufficientCreditsError,
  AgentRunMissingApiKeyError,
  createNextMissionFromRecommendation,
  decideOnDeliverable,
  iterateOnDeliverable,
  startAgentRun,
} from '../services/agentRunService'
import { missionRowToUi } from '../services/mappers'
import type { MissionRow } from '../lib/database.types'
import { defaultAgents } from './data'
import {
  createLocalUser,
  createMissionPayload,
  createProjectPayload,
  loadSnapshot,
  saveSnapshot,
} from './storage'

// Map a mission's visible title (and optional agent id) to one of the
// backend mission_type values understood by server/agents/index.ts
// (resolveAgentMission). Unknown titles fall back to
// 'clarify-business-idea' which is also the orchestrator's default.
function resolveMissionType(
  title: string,
  agentId?: string,
): string {
  const norm = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (norm.includes('clarif')) return 'clarify-business-idea'
  if (
    norm.includes('analyser mon marche') ||
    norm.includes('analyser les concurrent') ||
    norm.includes('scan') ||
    norm.includes('opportunit')
  ) {
    return 'scan'
  }
  if (norm.includes('cible') || norm.includes('segment') || norm.includes('persona')) {
    return 'segment'
  }
  if (norm.includes('positionne')) return 'positioning'
  if (norm.includes('proposition de valeur') || norm.includes('value prop')) {
    return 'value-prop'
  }
  if (norm.includes('offre') || norm.includes('offer')) return 'offer'
  if (norm.includes('landing') || norm.includes('page')) return 'landing'
  if (norm.includes('acquisition') || norm.includes('canaux')) return 'acquisition'
  if (norm.includes('brand') || norm.includes('marque')) return 'brand-kit'
  // Agent-id hints as a secondary signal.
  if (agentId === 'market-analyst' || agentId === 'market') return 'scan'
  if (agentId === 'builder') return 'landing'
  if (agentId === 'growth') return 'acquisition'
  return 'clarify-business-idea'
}

export type BackendMode = 'supabase' | 'local'

export interface BackendState {
  mode: BackendMode
  user: AuthUser | null
  project: Project | null
  agents: Agent[]
  missions: Mission[]
  activity: ActivityEvent[]
  deliverables: DeliverableRow[]
  wallet: CreditWallet | null
  plan: Plan | null
  subscription: Subscription | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  creditError: string | null
}

export interface BackendApi {
  state: BackendState
  signUp: (email: string, password?: string) => Promise<void>
  signIn: (email: string, password?: string) => Promise<void>
  signOut: () => Promise<void>
  createWorkspace: (payload: {
    name: string
    description: string
    projectType: ProjectType
    mainGoal: MainGoal
  }) => Promise<void>
  createMission: (payload: { agentId: string; title: string; description: string }) => Promise<void>
  runMission: (missionId: string) => Promise<void>
  validateDeliverable: (deliverableId: string, feedback?: string) => Promise<void>
  rejectDeliverable: (deliverableId: string, feedback?: string) => Promise<void>
  iterateDeliverable: (deliverableId: string, feedback: string) => Promise<void>
  convertRecommendation: (deliverableId: string, recommendationIndex: number) => Promise<void>
  clearCreditError: () => void
}

function emptyState(mode: BackendMode): BackendState {
  return {
    mode,
    user: null,
    project: null,
    agents: [],
    missions: [],
    activity: [],
    deliverables: [],
    wallet: null,
    plan: null,
    subscription: null,
    status: 'idle',
    error: null,
    creditError: null,
  }
}

export function useAutarsBackend(): BackendApi {
  const mode: BackendMode = isSupabaseConfigured ? 'supabase' : 'local'
  const [state, setState] = useState<BackendState>(() => {
    if (mode === 'local') {
      const snap = loadSnapshot()
      return {
        ...emptyState(mode),
        user: snap.user,
        project: snap.project,
        agents: snap.agents,
        missions: snap.missions,
        status: 'ready',
      }
    }
    return { ...emptyState(mode), status: 'loading' }
  })

  // Persist snapshot in local mode so the offline experience is unchanged.
  useEffect(() => {
    if (mode !== 'local') return
    saveSnapshot({
      user: state.user,
      project: state.project,
      agents: state.agents,
      missions: state.missions,
    })
  }, [mode, state.user, state.project, state.agents, state.missions])

  // Local mock progress ticker (kept for parity with the previous behavior).
  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((current) => ({
        ...current,
        missions: current.missions.map((mission) => {
          if (mission.status !== 'en cours' || mission.progress >= 92) return mission
          return { ...mission, progress: Math.min(92, mission.progress + 4) }
        }),
      }))
    }, 4200)
    return () => window.clearInterval(interval)
  }, [])

  // ---- Supabase: hydrate everything for a given user ----
  const hydrate = useCallback(async (user: AuthUser) => {
    setState((prev) => ({ ...prev, status: 'loading', error: null, user }))
    try {
      const [project, wallet, subscription] = await Promise.all([
        fetchWorkspaceForUser(user.id),
        fetchWallet(user.id),
        fetchActiveSubscription(user.id),
      ])
      const plan = subscription ? await fetchPlan(subscription.planId) : null

      if (!project) {
        setState((prev) => ({
          ...prev,
          user,
          project: null,
          agents: [],
          missions: [],
          activity: [],
          deliverables: [],
          wallet,
          plan,
          subscription,
          status: 'ready',
        }))
        return
      }
      const [agents, missions, activity, deliverables] = await Promise.all([
        fetchAgents(project.id),
        fetchMissions(project.id),
        fetchActivity(project.id),
        fetchDeliverablesForWorkspace(project.id),
      ])
      setState({
        mode: 'supabase',
        user,
        project,
        agents,
        missions,
        activity,
        deliverables,
        wallet,
        plan,
        subscription,
        status: 'ready',
        error: null,
        creditError: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement Supabase.'
      setState((prev) => ({ ...prev, status: 'error', error: message }))
    }
  }, [])

  useEffect(() => {
    if (mode !== 'supabase' || !supabase) return
    let cancelled = false
    void (async () => {
      try {
        const user = await getCurrentUser()
        if (cancelled) return
        if (user) {
          await hydrate(user)
        } else {
          setState((prev) => ({ ...prev, status: 'ready' }))
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Erreur de session Supabase.'
        setState((prev) => ({ ...prev, status: 'error', error: message }))
      }
    })()
    const unsub = onAuthChange((user) => {
      if (cancelled) return
      if (user) void hydrate(user)
      else setState({ ...emptyState('supabase'), status: 'ready' })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [mode, hydrate])

  // ---- Supabase: realtime activity feed ----
  const projectId = state.project?.id
  useEffect(() => {
    if (mode !== 'supabase' || !projectId) return
    const unsub = subscribeToActivity(projectId, (event) => {
      setState((prev) =>
        prev.activity.some((e) => e.id === event.id)
          ? prev
          : { ...prev, activity: [event, ...prev.activity].slice(0, 50) },
      )
    })
    return unsub
  }, [mode, projectId])

  // ---- Supabase: realtime deliverables feed ----
  useEffect(() => {
    if (mode !== 'supabase' || !projectId) return
    const unsub = subscribeToDeliverables(projectId, (row) => {
      setState((prev) => {
        const next = prev.deliverables.filter((d) => d.id !== row.id)
        return { ...prev, deliverables: [row, ...next].slice(0, 100) }
      })
    })
    return unsub
  }, [mode, projectId])

  // ---- Supabase: realtime mission lifecycle ----
  useEffect(() => {
    if (mode !== 'supabase' || !projectId || !supabase) return
    const channel = supabase
      .channel(`missions:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'missions',
          filter: `workspace_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as MissionRow | null
          if (!row) return
          const mapped = missionRowToUi(row)
          setState((prev) => ({
            ...prev,
            missions: prev.missions.map((m) => (m.id === mapped.id ? mapped : m)),
          }))
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'missions',
          filter: `workspace_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as MissionRow | null
          if (!row) return
          const mapped = missionRowToUi(row)
          setState((prev) =>
            prev.missions.some((m) => m.id === mapped.id)
              ? prev
              : { ...prev, missions: [mapped, ...prev.missions] },
          )
        },
      )
      .subscribe()
    return () => {
      void supabase?.removeChannel(channel)
    }
  }, [mode, projectId])

  // ---- Supabase: realtime wallet balance ----
  const userId = state.user?.id
  useEffect(() => {
    if (mode !== 'supabase' || !userId || !supabase) return
    const channel = supabase
      .channel(`wallet:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'credit_wallets',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as
            | {
                id: string
                user_id: string
                balance: number
                monthly_allowance: number
                last_refill_at: string | null
              }
            | null
          if (!row) return
          setState((prev) => ({
            ...prev,
            wallet: {
              id: row.id,
              userId: row.user_id,
              balance: row.balance,
              monthlyAllowance: row.monthly_allowance,
              lastRefillAt: row.last_refill_at,
            },
          }))
        },
      )
      .subscribe()
    return () => {
      void supabase?.removeChannel(channel)
    }
  }, [mode, userId])

  // ---- Supabase: realtime agent status changes ----
  useEffect(() => {
    if (mode !== 'supabase' || !projectId || !supabase) return
    const channel = supabase
      .channel(`agents:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `workspace_id=eq.${projectId}`,
        },
        () => {
          // Refetch agents (cheap, small set) to pick up status/xp/level changes.
          void fetchAgents(projectId)
            .then((agents) => setState((prev) => ({ ...prev, agents })))
            .catch(() => {})
        },
      )
      .subscribe()
    return () => {
      void supabase?.removeChannel(channel)
    }
  }, [mode, projectId])

  // ---- Seed-key -> real agent uuid translation ----
  const seedAgentLookup = useMemo(() => {
    if (mode !== 'supabase') return new Map<string, string>()
    const seedNames = new Map(defaultAgents.map((a) => [a.name, a.id]))
    const map = new Map<string, string>()
    for (const agent of state.agents) {
      const seedKey = seedNames.get(agent.name)
      if (seedKey) map.set(seedKey, agent.id)
    }
    return map
  }, [mode, state.agents])

  // ---- Actions ----
  const signUp = useCallback(
    async (email: string, password?: string) => {
      setState((prev) => ({ ...prev, status: 'loading', error: null }))
      try {
        if (mode === 'supabase') {
          if (!password) throw new Error('Mot de passe requis pour Supabase.')
          const user = await signUpWithPassword(email, password)
          await hydrate(user)
          return
        }
        const user = createLocalUser(email)
        setState((prev) => ({ ...prev, user, status: 'ready' }))
      } catch (err) {
        const message = err instanceof Error ? err.message : "Inscription impossible."
        setState((prev) => ({ ...prev, status: 'error', error: message }))
        throw err
      }
    },
    [mode, hydrate],
  )

  const signIn = useCallback(
    async (email: string, password?: string) => {
      setState((prev) => ({ ...prev, status: 'loading', error: null }))
      try {
        if (mode === 'supabase') {
          if (!password) throw new Error('Mot de passe requis pour Supabase.')
          const user = await signInWithPassword(email, password)
          await hydrate(user)
          return
        }
        const user = createLocalUser(email)
        setState((prev) => ({ ...prev, user, status: 'ready' }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connexion impossible.'
        setState((prev) => ({ ...prev, status: 'error', error: message }))
        throw err
      }
    },
    [mode, hydrate],
  )

  const signOut = useCallback(async () => {
    try {
      if (mode === 'supabase') await supabaseSignOut()
    } finally {
      setState({ ...emptyState(mode), status: 'ready' })
    }
  }, [mode])

  const createWorkspace = useCallback(
    async (payload: {
      name: string
      description: string
      projectType: ProjectType
      mainGoal: MainGoal
    }) => {
      const current = state.user
      if (!current) throw new Error('Utilisateur non connecté.')
      if (mode === 'supabase') {
        setState((prev) => ({ ...prev, status: 'loading', error: null }))
        try {
          await createWorkspaceWithDefaults({ userId: current.id, ...payload })
          await hydrate(current)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Création du QG impossible.'
          setState((prev) => ({ ...prev, status: 'error', error: message }))
          throw err
        }
        return
      }
      const created = createProjectPayload({ userId: current.id, ...payload })
      setState((prev) => ({
        ...prev,
        project: created.project,
        agents: created.agents,
        missions: created.missions,
      }))
    },
    [mode, state.user, hydrate],
  )

  // Avoid double-submitting create-mission in local mode.
  const seedingRef = useRef(false)
  // Throttle double-clicks on Launch.
  const launchingRef = useRef(new Set<string>())

  const runMission = useCallback(
    async (missionId: string) => {
      const project = state.project
      const user = state.user
      if (!project || !user) return
      if (mode !== 'supabase') {
        setState((prev) => ({
          ...prev,
          missions: prev.missions.map((m) =>
            m.id === missionId ? { ...m, status: 'en cours' } : m,
          ),
        }))
        return
      }
      if (launchingRef.current.has(missionId)) return
      launchingRef.current.add(missionId)
      // Optimistic UI flip to "en cours".
      setState((prev) => ({
        ...prev,
        creditError: null,
        missions: prev.missions.map((m) =>
          m.id === missionId ? { ...m, status: 'en cours', progress: 12 } : m,
        ),
      }))
      try {
        await startAgentRun(missionId)
        // Realtime channels will pick up the rest (mission status, deliverable,
        // activity events). We do nothing else here.
      } catch (err) {
        if (err instanceof AgentRunInsufficientCreditsError) {
          setState((prev) => ({
            ...prev,
            creditError: err.message,
            missions: prev.missions.map((m) =>
              m.id === missionId ? { ...m, status: 'en attente', progress: 0 } : m,
            ),
          }))
          return
        }
        if (err instanceof AgentRunAlreadyActiveError) {
          // Mission already running — leave state alone, the realtime channel
          // will deliver the next transition.
          return
        }
        if (err instanceof AgentRunMissingApiKeyError) {
          setState((prev) => ({
            ...prev,
            error: err.message,
            missions: prev.missions.map((m) =>
              m.id === missionId ? { ...m, status: 'en attente', progress: 0 } : m,
            ),
          }))
          return
        }
        if (err instanceof AgentRunFailedError) {
          setState((prev) => ({
            ...prev,
            error: err.message,
            missions: prev.missions.map((m) =>
              m.id === missionId
                ? { ...m, status: 'en attente', progress: 0 }
                : m,
            ),
          }))
          return
        }
        const message =
          err instanceof Error ? err.message : 'Lancement de mission impossible.'
        setState((prev) => ({
          ...prev,
          error: message,
          missions: prev.missions.map((m) =>
            m.id === missionId ? { ...m, status: 'en attente', progress: 0 } : m,
          ),
        }))
      } finally {
        launchingRef.current.delete(missionId)
      }
    },
    [mode, state.project, state.user],
  )

  const createMission = useCallback(
    async (payload: { agentId: string; title: string; description: string }) => {
      const project = state.project
      const user = state.user
      if (!project || !user) return

      if (mode === 'supabase') {
        const realAgentId = seedAgentLookup.get(payload.agentId) ?? payload.agentId
        const target =
          state.agents.find((a) => a.id === realAgentId) ?? state.agents[0]
        // Map the mission title to one of the backend mission_type values
        // so the agent runner picks the right system prompt + tool set
        // (e.g. "Analyser mon marché" → 'scan', which enables web tools).
        const missionType = resolveMissionType(payload.title, payload.agentId)
        try {
          const mission = await supabaseCreateMission({
            workspaceId: project.id,
            ownerId: user.id,
            agentId: target?.id ?? null,
            title: payload.title,
            description: payload.description,
            costCredits: 1,
            type: missionType,
          })
          setState((prev) => ({
            ...prev,
            creditError: null,
            missions: [mission, ...prev.missions.filter((m) => m.id !== mission.id)],
          }))
          // Auto-launch the freshly created mission via the real agent runner.
          await runMission(mission.id)
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            setState((prev) => ({ ...prev, creditError: err.message }))
            return
          }
          const message = err instanceof Error ? err.message : 'Création de mission impossible.'
          setState((prev) => ({ ...prev, error: message }))
          throw err
        }
        return
      }

      if (seedingRef.current) return
      const mission = createMissionPayload({
        projectId: project.id,
        agentId: payload.agentId,
        title: payload.title,
        description: payload.description,
      })
      setState((prev) => ({
        ...prev,
        missions: [mission, ...prev.missions],
        agents: prev.agents.map((agent) =>
          agent.id === payload.agentId ? { ...agent, status: 'travaille' } : agent,
        ),
      }))
    },
    [mode, state.project, state.user, state.agents, seedAgentLookup, runMission],
  )

  const validateDeliverable = useCallback(
    async (deliverableId: string, feedback?: string) => {
      if (mode !== 'supabase') return
      try {
        await decideOnDeliverable({ deliverableId, decision: 'validated', feedback })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation impossible.'
        setState((prev) => ({ ...prev, error: message }))
      }
    },
    [mode],
  )

  const rejectDeliverable = useCallback(
    async (deliverableId: string, feedback?: string) => {
      if (mode !== 'supabase') return
      try {
        await decideOnDeliverable({ deliverableId, decision: 'rejected', feedback })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action impossible.'
        setState((prev) => ({ ...prev, error: message }))
      }
    },
    [mode],
  )

  const iterateDeliverable = useCallback(
    async (deliverableId: string, feedback: string) => {
      if (mode !== 'supabase') return
      try {
        await iterateOnDeliverable({ deliverableId, feedback })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Itération impossible.'
        setState((prev) => ({ ...prev, error: message }))
      }
    },
    [mode],
  )

  const convertRecommendation = useCallback(
    async (deliverableId: string, recommendationIndex: number) => {
      if (mode !== 'supabase') return
      try {
        await createNextMissionFromRecommendation({
          fromDeliverableId: deliverableId,
          recommendationIndex,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Création impossible.'
        setState((prev) => ({ ...prev, error: message }))
      }
    },
    [mode],
  )

  const clearCreditError = useCallback(() => {
    setState((prev) => ({ ...prev, creditError: null }))
  }, [])

  return {
    state,
    signUp,
    signIn,
    signOut,
    createWorkspace,
    createMission,
    runMission,
    validateDeliverable,
    rejectDeliverable,
    iterateDeliverable,
    convertRecommendation,
    clearCreditError,
  }
}
