import { AnimatePresence, motion } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import { useGame, MISSION_TEMPLATES, type ActiveProduct } from './store'

export function RightHud() {
  const selectedId = useGame((s) => s.selectedAgentId)
  const agents = useGame((s) => s.agents)
  const credits = useGame((s) => s.credits)
  const enqueueMission = useGame((s) => s.enqueueMission)
  const completeMission = useGame((s) => s.completeMission)
  const unlockAgent = useGame((s) => s.unlockAgent)
  const openAgentDrawer = useGame((s) => s.openAgentDrawer)

  const agent = selectedId ? agents[selectedId] : null

  return (
    <aside className="hud hud-right" aria-label="Détails de l'agent sélectionné">
      <AnimatePresence mode="wait">
        {agent ? (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            className="hud-detail"
          >
            <header className="hud-detail-head">
              <div className="hud-detail-portrait" style={{ background: agent.themeColor }}>
                <span>{agent.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div>
                <p className="hud-eyebrow">{stateLabel(agent.state)}</p>
                <h3>{agent.name}</h3>
                <p className="hud-sub">{agent.className}</p>
              </div>
            </header>

            <p className="hud-description">{agent.description}</p>

            <div className="hud-stat-grid">
              <Stat label="Niveau" value={`Niv. ${agent.level}`} />
              <Stat label="Fiabilité" value={`${agent.reliability}%`} />
              <Stat label="Impact" value={agent.impactLabel} />
              <Stat label="Atelier" value={accessoryLabel(agent.accessory)} />
            </div>

            {agent.state !== 'locked' && (
              <div className="hud-progress">
                <div className="hud-progress-head">
                  <span>Progression</span>
                  <strong className="hud-mono">{Math.round(agent.progress * 100)}%</strong>
                </div>
                <div className="hud-progress-track">
                  <motion.div
                    className="hud-progress-fill"
                    initial={false}
                    animate={{ width: `${Math.max(6, agent.progress * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                  <div className="hud-progress-segments" aria-hidden>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                </div>
                <p className="hud-muted hud-muted-sm">{stateMessage(agent.state)}</p>
              </div>
            )}

            {agent.state !== 'locked' && (
              <div className="hud-queue">
                <span className="hud-queue-label">File de tâches</span>
                <strong className="hud-queue-count">
                  {agent.taskQueue.length === 0
                    ? 'Vide'
                    : `${agent.taskQueue.length} tâche${agent.taskQueue.length > 1 ? 's' : ''} en attente`}
                </strong>
              </div>
            )}

            <div className="hud-actions">
              {agent.state === 'locked' ? (
                <button
                  type="button"
                  className="hud-action hud-action-success"
                  disabled={credits < (agent.unlockCost ?? 0)}
                  onClick={() => unlockAgent(agent.id)}
                >
                  <span>Recruter</span>
                  <em>{agent.unlockCost}c</em>
                </button>
              ) : agent.state === 'delivered' ? (
                <button
                  type="button"
                  className="hud-action hud-action-success"
                  onClick={() => completeMission(agent.id)}
                >
                  <span>Valider le livrable</span>
                  <em>+ revenus €</em>
                </button>
              ) : agent.state === 'working' || agent.state === 'walking' ? (
                <button
                  type="button"
                  className="hud-action hud-action-primary"
                  onClick={() => enqueueMission(agent.id, defaultMissionFor(agent.id))}
                >
                  <span>Empiler une mission</span>
                  <em>-{missionCostFor(agent.id)} crédits</em>
                </button>
              ) : (
                <button
                  type="button"
                  className="hud-action hud-action-primary"
                  onClick={() => enqueueMission(agent.id, defaultMissionFor(agent.id))}
                >
                  <span>Lancer une mission</span>
                  <em>-{missionCostFor(agent.id)} crédits</em>
                </button>
              )}

              <button
                type="button"
                className="hud-action hud-action-ghost"
                onClick={() => openAgentDrawer(agent.id)}
              >
                Ouvrir la fiche complète →
              </button>
            </div>

            <ul className="hud-meta-list">
              <li>
                <span>Statut</span>
                <strong>{stateLabel(agent.state)}</strong>
              </li>
              <li>
                <span>Atelier assigné</span>
                <strong>{agent.workspaceId ?? '—'}</strong>
              </li>
              <li>
                <span>Identifiant</span>
                <strong className="hud-mono">{agent.id}</strong>
              </li>
            </ul>
          </motion.div>
        ) : (
          <motion.div
            key="infra"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
          >
            <InfrastructurePanel />
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  )
}

function InfrastructurePanel() {
  const hqLevel = useGame((s) => s.hqLevel)
  const activeVentureId = useGame((s) => s.activeVentureId)
  const ventureName = useGame((s) => s.ventureName)
  const products = useGame(
    useShallow((s) =>
      s.activeProducts.filter((p) => p.ventureId === activeVentureId),
    ),
  )
  const workingAgents = useGame(
    (s) =>
      Object.values(s.agents).filter(
        (a) => a.state === 'working' || a.state === 'walking',
      ).length,
  )
  const realRevenue = useGame((s) => s.realRevenue)

  const webInstances = Math.min(8, 2 + Math.max(0, hqLevel - 1))
  const dbUptime = (99.9 - (workingAgents > 4 ? 0.1 : 0)).toFixed(1)
  const cpuLoad = Math.min(94, 18 + workingAgents * 14 + products.length * 6)

  return (
    <section className="infra-panel" aria-label="Infrastructure de la filiale">
      <header className="infra-head">
        <p className="hud-eyebrow">Infrastructure</p>
        <h3>Production &amp; Clusters</h3>
        <p className="hud-sub">{ventureName} · stack temps réel</p>
      </header>

      <ul className="infra-list">
        <InfraRow
          label="Load Balancer"
          status="Active"
          tone="ok"
          right="haproxy/2.8"
        />
        <InfraRow
          label="Web Servers"
          status={`${webInstances} / ${webInstances} Instances en ligne`}
          tone="ok"
          right="nginx · :443"
        />
        <InfraRow
          label="Database (Postgres IA)"
          status={`Synchro (${dbUptime}% uptime)`}
          tone="ok"
          right="pgvector"
        />
        <InfraRow
          label="LLM Gateway"
          status={workingAgents > 0 ? 'Streaming' : 'Idle'}
          tone={workingAgents > 0 ? 'pulse' : 'muted'}
          right={`load ${cpuLoad}%`}
        />
      </ul>

      <div className="infra-section">
        <p className="infra-section-label">Containers actifs</p>
        {products.length === 0 ? (
          <p className="infra-empty">
            Aucun service déployé. Valide un livrable pour le pousser en production.
          </p>
        ) : (
          <ul className="infra-container-list">
            {products.slice(0, 5).map((p) => (
              <ContainerRow key={p.id} product={p} />
            ))}
            {products.length > 5 && (
              <li className="infra-container-more">
                + {products.length - 5} containers supplémentaires
              </li>
            )}
          </ul>
        )}
      </div>

      <footer className="infra-foot">
        <div>
          <span>Revenu cumulé</span>
          <strong className="hud-mono">{realRevenue}€</strong>
        </div>
        <div>
          <span>QG</span>
          <strong>Niv. {hqLevel}</strong>
        </div>
      </footer>
    </section>
  )
}

function InfraRow({
  label,
  status,
  tone,
  right,
}: {
  label: string
  status: string
  tone: 'ok' | 'pulse' | 'muted'
  right: string
}) {
  return (
    <li className={`infra-row infra-row-${tone}`}>
      <span className="infra-dot" aria-hidden />
      <div className="infra-row-text">
        <span className="infra-row-label">{label}</span>
        <strong className="infra-row-status">{status}</strong>
      </div>
      <em className="infra-row-meta">{right}</em>
    </li>
  )
}

function ContainerRow({ product }: { product: ActiveProduct }) {
  const containerId = `ox-${product.id.slice(-4)}`
  return (
    <li className="infra-container">
      <span className="infra-container-id">[Container id: {containerId}]</span>
      <span className="infra-container-title">{product.title}</span>
      <span className="infra-container-running">Running</span>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function defaultMissionFor(agentId: string): keyof typeof MISSION_TEMPLATES {
  if (agentId === 'analyst') return 'scan'
  if (agentId === 'strategist') return 'positioning'
  if (agentId === 'brandBuilder') return 'branding'
  return 'marketing'
}

function missionCostFor(agentId: string) {
  return MISSION_TEMPLATES[defaultMissionFor(agentId)].creditCost
}

function accessoryLabel(s: string) {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function stateLabel(s: string) {
  switch (s) {
    case 'working':
      return 'En mission'
    case 'walking':
      return 'En route'
    case 'delivered':
      return 'Livrable prêt'
    case 'celebrating':
      return 'Victoire'
    case 'idle':
      return 'Disponible'
    case 'locked':
      return 'Verrouillé'
    default:
      return s
  }
}

function stateMessage(s: string) {
  switch (s) {
    case 'working':
      return 'Mission en cours… La jauge se remplit segment par segment.'
    case 'walking':
      return "L'agent se dirige vers son poste de travail."
    case 'delivered':
      return 'Livrable prêt — validation requise pour récupérer les crédits.'
    case 'celebrating':
      return "L'agent fête sa victoire ! 🎉"
    case 'idle':
      return 'En attente — lance une mission pour exploiter ses compétences.'
    default:
      return ''
  }
}
