import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame } from './store'

export function AgentDrawer() {
  const drawerAgentId = useGame((s) => s.drawerAgentId)
  const agent = useGame(useShallow((s) => (s.drawerAgentId ? s.agents[s.drawerAgentId] : null)))
  const logs = useGame(
    useShallow((s) =>
      s.drawerAgentId
        ? s.logs.filter((l) => l.agentId === s.drawerAgentId).slice(0, 12)
        : [],
    ),
  )
  const deliverables = useGame(
    useShallow((s) =>
      s.drawerAgentId
        ? Object.values(s.deliverables)
            .filter((d) => d.agentId === s.drawerAgentId)
            .sort((a, b) => b.generatedAt - a.generatedAt)
        : [],
    ),
  )
  const close = useGame((s) => s.openAgentDrawer)
  const openDeliverable = useGame((s) => s.openDeliverable)

  useEffect(() => {
    if (!drawerAgentId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerAgentId, close])

  return (
    <AnimatePresence>
      {drawerAgentId && agent && (
        <>
          <motion.div
            key="drawer-backdrop"
            className="drawer-backdrop"
            onClick={() => close(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            key="drawer"
            className="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            aria-label={`Fiche complète — ${agent.name}`}
          >
            <header className="drawer-head">
              <div className="drawer-portrait" style={{ background: agent.themeColor }}>
                <span>{agent.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="drawer-titles">
                <p className="hud-eyebrow">{stateLabel(agent.state)}</p>
                <h2>{agent.name}</h2>
                <p className="drawer-class">
                  {agent.className} · {agent.accessory}
                </p>
              </div>
              <button
                type="button"
                className="drawer-close"
                onClick={() => close(null)}
                aria-label="Fermer la fiche"
              >
                ✕
              </button>
            </header>

            <div className="drawer-body">
              <p className="drawer-description">{agent.description}</p>

              <section className="drawer-section">
                <h3>Statistiques</h3>
                <div className="drawer-stats">
                  <DrawerStat label="Niveau" value={`Niv. ${agent.level}`} />
                  <DrawerStat label="Fiabilité" value={`${agent.reliability}%`} />
                  <DrawerStat label="Impact" value={agent.impactLabel} />
                  <DrawerStat
                    label="Progression"
                    value={`${Math.round(agent.progress * 100)}%`}
                  />
                </div>
              </section>

              <section className="drawer-section">
                <h3>Activité récente</h3>
                {logs.length === 0 ? (
                  <p className="drawer-empty">Aucun évènement récent pour cet agent.</p>
                ) : (
                  <ul className="drawer-logs">
                    {logs.map((l) => (
                      <li key={l.id}>
                        <time>{formatTime(l.ts)}</time>
                        <span>{l.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="drawer-section">
                <h3>Livrables</h3>
                {deliverables.length === 0 ? (
                  <p className="drawer-empty">Pas encore de livrable archivé.</p>
                ) : (
                  <ul className="drawer-deliverables">
                    {deliverables.map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => openDeliverable(d.id)}>
                          <div>
                            <strong>{d.missionTitle}</strong>
                            <span>{new Date(d.generatedAt).toLocaleString('fr-FR')}</span>
                          </div>
                          <em>Ouvrir →</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="drawer-section">
                <h3>Identité technique</h3>
                <ul className="drawer-meta">
                  <li>
                    <span>Identifiant</span>
                    <strong className="hud-mono">{agent.id}</strong>
                  </li>
                  <li>
                    <span>Atelier assigné</span>
                    <strong>{agent.workspaceId ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Base d'opération</span>
                    <strong>{agent.homeWorkspaceId}</strong>
                  </li>
                </ul>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function DrawerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="drawer-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
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

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}
