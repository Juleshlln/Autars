import { AnimatePresence, motion } from 'framer-motion'
import { useGame, MISSION_TEMPLATES } from './store'

export function RightHud() {
  const selectedId = useGame((s) => s.selectedAgentId)
  const agents = useGame((s) => s.agents)
  const credits = useGame((s) => s.credits)
  const startMission = useGame((s) => s.startMission)
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
                  <em>+ crédits</em>
                </button>
              ) : agent.state === 'working' || agent.state === 'walking' ? (
                <button type="button" className="hud-action" disabled>
                  Mission en cours
                </button>
              ) : (
                <button
                  type="button"
                  className="hud-action hud-action-primary"
                  onClick={() => startMission(agent.id, defaultMissionFor(agent.id))}
                >
                  <span>Lancer une mission</span>
                  <em>-{missionCostFor(agent.id)}⚡</em>
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
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hud-empty"
          >
            <div className="hud-empty-icon">◉</div>
            <h3>Sélectionne un agent</h3>
            <p>Clique sur une silhouette dans le QG pour voir ses statistiques détaillées.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
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
  return MISSION_TEMPLATES[defaultMissionFor(agentId)].energyCost
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
