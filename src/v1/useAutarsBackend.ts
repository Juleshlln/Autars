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
  launchMission as supabaseLaunchMission,
} from '../services/missionsService'
import { scheduleSimulation } from '../services/missionSimulation'
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
import { defaultAgents } from './data'
import {
  createLocalUser,
  createMissionPayload,
  createProjectPayload,
  loadSnapshot,
  saveSnapshot,
} from './storage'

export type BackendMode = 'supabase' | 'local'

export interface BackendState {
  mode: BackendMode
  user: AuthUser | null
  project: Project | null
  agents: Agent[]
  missions: Mission[]
  activity: ActivityEvent[]
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
          wallet,
          plan,
          subscription,
          status: 'ready',
        }))
        return
      }
      const [agents, missions, activity] = await Promise.all([
        fetchAgents(project.id),
        fetchMissions(project.id),
        fetchActivity(project.id),
      ])
      setState({
        mode: 'supabase',
        user,
        project,
        agents,
        missions,
        activity,
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

  // Simulated agent completion. The actual logic lives in
  // services/missionSimulation.ts so it can be moved server-side later
  // without touching this hook.
  const scheduleSimulatedCompletion = useCallback(
    (mission: Mission, workspaceId: string, ownerId: string) => {
      scheduleSimulation(
        {
          missionId: mission.id,
          workspaceId,
          ownerId,
          agentId: mission.agentId || null,
          title: mission.title,
          type: mission.type,
          xpReward: mission.xpReward,
        },
        ({ mission: updated, xp }) => {
          setState((prev) => ({
            ...prev,
            missions: prev.missions.map((m) => (m.id === updated.id ? updated : m)),
            agents: xp && xp.ok && mission.agentId
              ? prev.agents.map((a) =>
                  a.id === mission.agentId ? { ...a, status: 'actif' } : a,
                )
              : prev.agents,
          }))
          // Refresh agents to pick up the new xp/level from the RPC.
          if (xp && xp.ok) {
            void fetchAgents(workspaceId)
              .then((agents) => setState((prev) => ({ ...prev, agents })))
              .catch(() => {})
          }
        },
      )
    },
    [],
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
        try {
          const mission = await supabaseCreateMission({
            workspaceId: project.id,
            ownerId: user.id,
            agentId: target?.id ?? null,
            title: payload.title,
            description: payload.description,
            costCredits: 1,
            type: 'user_action',
          })
          setState((prev) => ({
            ...prev,
            creditError: null,
            missions: [mission, ...prev.missions.filter((m) => m.id !== mission.id)],
            agents: prev.agents.map((a) =>
              a.id === target?.id ? { ...a, status: 'travaille' } : a,
            ),
            wallet: prev.wallet
              ? { ...prev.wallet, balance: Math.max(0, prev.wallet.balance - 1) }
              : prev.wallet,
          }))
          scheduleSimulatedCompletion(mission, project.id, user.id)
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
    [
      mode,
      state.project,
      state.user,
      state.agents,
      seedAgentLookup,
      scheduleSimulatedCompletion,
    ],
  )

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
      const mission = state.missions.find((m) => m.id === missionId)
      if (!mission) return
      try {
        const result = await supabaseLaunchMission({
          missionId,
          workspaceId: project.id,
          ownerId: user.id,
          agentId: mission.agentId || null,
          cost: mission.costCredits,
          title: mission.title,
        })
        setState((prev) => ({
          ...prev,
          creditError: null,
          missions: prev.missions.map((m) => (m.id === missionId ? result.mission : m)),
          agents: prev.agents.map((a) =>
            a.id === mission.agentId ? { ...a, status: 'travaille' } : a,
          ),
          wallet: prev.wallet
            ? { ...prev.wallet, balance: Math.max(0, prev.wallet.balance - 1) }
            : prev.wallet,
        }))
        scheduleSimulatedCompletion(result.mission, project.id, user.id)
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          setState((prev) => ({ ...prev, creditError: err.message }))
          return
        }
        const message = err instanceof Error ? err.message : 'Lancement de mission impossible.'
        setState((prev) => ({ ...prev, error: message }))
      }
    },
    [mode, state.project, state.user, state.missions, scheduleSimulatedCompletion],
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
    clearCreditError,
  }
}
