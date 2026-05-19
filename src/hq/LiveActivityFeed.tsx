import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { getAgents } from '../state'
import { missions as baseMissions } from '../data'

type OperationalAgent = ReturnType<typeof getAgents>[number]

type EventKind = 'work' | 'result' | 'unlock' | 'decision' | 'system'

interface FeedEvent {
  id: string
  kind: EventKind
  agent?: string
  title: string
  detail: string
  time: string
}

interface LiveActivityFeedProps {
  step: number
  agents: OperationalAgent[]
}

/**
 * Feed temps réel d'événements du QG. Les items entrent/sortent avec animation.
 * Un événement "live" est injecté périodiquement pour donner l'impression
 * que les agents travaillent réellement.
 */
export function LiveActivityFeed({ step, agents }: LiveActivityFeedProps) {
  const baseFeed = useMemo<FeedEvent[]>(() => buildBaseFeed(step, agents), [step, agents])
  const [tick, setTick] = useState(0)

  // Toutes les ~5s, on incrémente un compteur pour faire apparaître un
  // nouvel événement "live" en tête de feed. Les événements sont dérivés
  // au render (pas de setState miroir).
  useEffect(() => {
    const working = agents.filter((a) => a.status === 'Working' || a.status === 'Result')
    if (working.length === 0) return
    const id = window.setInterval(() => setTick((t) => t + 1), 5200)
    return () => window.clearInterval(id)
  }, [agents])

  const events = useMemo<FeedEvent[]>(() => {
    const working = agents.filter((a) => a.status === 'Working' || a.status === 'Result')
    const live: FeedEvent[] = []
    if (working.length > 0) {
      // Ne garde que les 3 derniers ticks pour ne pas noyer la base
      const recent = Math.min(tick, 3)
      for (let i = 0; i < recent; i++) {
        const n = tick - i
        const a = working[n % working.length]!
        live.push(liveTickEvent(a, n))
      }
    }
    return [...live, ...baseFeed].slice(0, 10)
  }, [tick, agents, baseFeed])

  return (
    <div className="live-feed">
      <div className="live-feed-head">
        <span className="live-dot" aria-hidden />
        <h3>Activité en direct</h3>
        <span className="live-feed-count">{events.length}</span>
      </div>

      <ol className="live-feed-list">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.li
              key={e.id}
              className={`feed-item feed-${e.kind}`}
              initial={{ opacity: 0, x: -16, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              layout
            >
              <span className={`feed-icon feed-icon-${e.kind}`} aria-hidden>
                {feedIcon(e.kind)}
              </span>
              <div className="feed-body">
                <div className="feed-title">
                  {e.agent && <strong className="feed-agent">{e.agent}</strong>}
                  <span>{e.title}</span>
                </div>
                <p className="feed-detail">{e.detail}</p>
              </div>
              <span className="feed-time mono">{e.time}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}

function feedIcon(kind: EventKind): string {
  switch (kind) {
    case 'work':     return '↻'
    case 'result':   return '✓'
    case 'unlock':   return '⬆'
    case 'decision': return '◇'
    case 'system':   return '◦'
  }
}

function buildBaseFeed(step: number, agents: OperationalAgent[]): FeedEvent[] {
  const events: FeedEvent[] = []
  let counter = 0
  const newId = () => `feed-${step}-${counter++}`

  const completedMissions = baseMissions.filter((m) => m.index <= step)
  const working = agents.filter((a) => a.status === 'Working' || a.status === 'Result')
  const justUnlocked = agents.filter((a) => a.unlockAfter === step && step > 0)

  if (working.length > 0) {
    const a = working[0]!
    events.push({
      id: newId(),
      kind: 'work',
      agent: a.name,
      title: 'travaille sur sa mission',
      detail: a.activeMission?.title ?? a.mission,
      time: 'maintenant',
    })
  }

  for (const a of justUnlocked) {
    events.push({
      id: newId(),
      kind: 'unlock',
      agent: a.name,
      title: 'rejoint l\'équipe',
      detail: `${a.className} · ${a.role}`,
      time: 'il y a 1 min',
    })
  }

  for (const m of completedMissions.slice(-3).reverse()) {
    events.push({
      id: newId(),
      kind: 'result',
      title: `Livrable validé · ${m.output}`,
      detail: `Mission "${m.title}" approuvée et ajoutée à la bibliothèque.`,
      time: `il y a ${m.index * 3} min`,
    })
  }

  const resultAgent = agents.find((a) => a.status === 'Result')
  if (resultAgent && resultAgent.activeMission) {
    events.unshift({
      id: newId(),
      kind: 'decision',
      agent: resultAgent.name,
      title: 'attend votre validation',
      detail: `Le livrable "${resultAgent.activeMission.output}" est prêt.`,
      time: 'il y a 30s',
    })
  }

  events.push({
    id: newId(),
    kind: 'system',
    title: 'QG opérationnel',
    detail: 'Aucune action externe ne sera exécutée sans votre accord.',
    time: 'au démarrage',
  })

  return events
}

function liveTickEvent(agent: OperationalAgent, n: number): FeedEvent {
  const samples: Record<string, string[]> = {
    Working: [
      'analyse les signaux',
      'prépare un fragment de livrable',
      'consulte la base de connaissances',
      'évalue les angles différenciants',
      'affine la promesse centrale',
      'vérifie les hypothèses marché',
    ],
    Result: [
      'a finalisé un fragment',
      'compile le rapport final',
      'attend la revue utilisateur',
    ],
    Ready: ['est en stand-by', 'attend une mission'],
    Waiting: ['attend une décision'],
    Blocked: ['signale un blocage'],
    Complete: ['archive le livrable précédent'],
    Upgrade: ['propose une amélioration'],
    Locked: ['est en veille'],
  }
  const pool = samples[agent.status] ?? ['traite des données']
  const detail = pool[n % pool.length]!
  return {
    id: `live-${agent.id}-${n}`,
    kind: agent.status === 'Result' ? 'result' : 'work',
    agent: agent.name,
    title: detail,
    detail: agent.activeMission?.title ?? agent.mission,
    time: 'à l\'instant',
  }
}
