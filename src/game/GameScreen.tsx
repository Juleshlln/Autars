import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PixiCanvas } from './PixiCanvas'
import { LeftHud } from './LeftHud'
import { RightHud } from './RightHud'
import { ContextMenu } from './ContextMenu'
import { ActivityConsole } from './ActivityConsole'
import { AgentDrawer } from './AgentDrawer'
import { DeliverableModal } from './DeliverableModal'
import { OfflineReportModal } from './OfflineReportModal'
import { useGame } from './store'

import './game.css'

interface Props {
  onBackToHub?: () => void
}

export function GameScreen({ onBackToHub }: Props) {
  const banner = useGame((s) => s.banner)
  const setBanner = useGame((s) => s.setBanner)
  const ventureName = useGame((s) => s.ventureName)
  const ventureSubtitle = useGame((s) => s.ventureSubtitle)
  const workingCount = useGame((s) => Object.values(s.agents).filter((a) => a.state === 'working' || a.state === 'walking').length)
  const deliveredCount = useGame((s) => Object.values(s.agents).filter((a) => a.state === 'delivered').length)
  const totalAgents = useGame((s) => Object.values(s.agents).filter((a) => a.state !== 'locked').length)
  const monitorStatus = deliveredCount > 0 ? 'Validation requise' : workingCount > 0 ? 'Flux actifs' : 'Veille active'

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 3200)
    return () => clearTimeout(t)
  }, [banner, setBanner])

  return (
    <div className="game-screen">
      <div className="game-bg" aria-hidden />

      <LeftHud />

      <main className="game-stage" aria-label="Quartier général animé">
        <header className="stage-header">
          <div className="stage-header-left">
            {onBackToHub && (
              <button type="button" className="stage-back" onClick={onBackToHub}>
                ← Hub
              </button>
            )}
            <div className="stage-header-tag">
              <span className="stage-pulse" /> Live · QG en réseau
            </div>
          </div>
          <p className="stage-hint">
            Clique un agent · Molette pour zoomer · Clic-droit pour déplacer la caméra
          </p>
        </header>

        <section className="stage-monitor" aria-label="Moniteur holographique du QG">
          <div className="stage-monitor-bezel">
            <div className="stage-monitor-bezel-left">
              <div className="stage-monitor-bezel-dots" aria-hidden>
                <i />
                <i />
                <i />
              </div>
              <strong>autars://hq/live/{ventureName.replace(/\s+/g, '-').toLowerCase()}</strong>
            </div>
            <div className="stage-monitor-bezel-meta">
              <span>{ventureSubtitle}</span>
              <strong>
                {workingCount}/{totalAgents} agents
              </strong>
            </div>
          </div>

          <div className="stage-monitor-screen">
            <PixiCanvas className="game-canvas" />
            <div className="stage-monitor-grid" aria-hidden />
            <div className="stage-monitor-scan" aria-hidden />
            <div className="stage-monitor-corners" aria-hidden>
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="stage-monitor-status" aria-hidden>
              <span>{monitorStatus}</span>
              {deliveredCount > 0 && <strong>{deliveredCount} prêt{deliveredCount > 1 ? 's' : ''}</strong>}
            </div>
            <footer className="stage-legend" aria-hidden>
              <span>
                <i className="dot dot-working" /> En mission
              </span>
              <span>
                <i className="dot dot-delivered" /> Livrable prêt
              </span>
              <span>
                <i className="dot dot-locked" /> Recrutement
              </span>
              <span>
                <i className="dot dot-core" /> Autars Core
              </span>
            </footer>
          </div>
        </section>

        <ActivityConsole />
      </main>

      <RightHud />

      <ContextMenu />
      <AgentDrawer />
      <DeliverableModal />
      <OfflineReportModal />

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.message}
            className={`game-banner game-banner-${banner.tone}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {banner.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
