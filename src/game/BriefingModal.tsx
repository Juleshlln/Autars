import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from './store'

export function BriefingModal() {
  const modal = useGame((s) => s.briefingModal)
  const deliverables = useGame((s) => s.deliverables)
  const agents = useGame((s) => s.agents)
  const close = useGame((s) => s.closeBriefingModal)
  const confirm = useGame((s) => s.confirmBriefingModal)

  const resetKey = `${modal?.agentId ?? ''}:${modal?.missionKey ?? ''}:${modal?.missionTemplateId ?? ''}`
  const [selection, setSelection] = useState<{ key: string; value: string | null }>({
    key: resetKey,
    value: null,
  })
  const selected = selection.key === resetKey ? selection.value : null
  const setSelected = (value: string | null) => setSelection({ key: resetKey, value })

  const list = useMemo(() => {
    return Object.values(deliverables).sort((a, b) => b.generatedAt - a.generatedAt)
  }, [deliverables])

  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, close])

  if (!modal) return null
  const agent = agents[modal.agentId]
  if (!agent) return null

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          key="briefing-overlay"
          className="briefing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <motion.div
            key="briefing-modal"
            className="briefing-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Briefing de mission"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              className="briefing-close"
              aria-label="Fermer"
              onClick={close}
            >
              ×
            </button>

            <header className="briefing-head">
              <p className="briefing-eyebrow">Briefing de mission</p>
              <h2>{modal.title}</h2>
              <p className="briefing-sub">
                Sélectionnez un livrable existant pour nourrir le contexte de cette mission
                (Optionnel)
              </p>
              <div className="briefing-agent">
                <span
                  className="briefing-agent-dot"
                  style={{ background: agent.themeColor }}
                />
                <strong>{agent.name}</strong>
                <span>·</span>
                <em>{agent.className}</em>
              </div>
            </header>

            <ul className="briefing-list">
              <li>
                <label
                  className={`briefing-option ${selected === null ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="briefing-deliverable"
                    checked={selected === null}
                    onChange={() => setSelected(null)}
                  />
                  <div>
                    <strong>Aucun contexte</strong>
                    <span>Lancer la mission sans dossier d'entrée</span>
                  </div>
                </label>
              </li>
              {list.map((d) => {
                const author = agents[d.agentId]?.name ?? d.agentName
                const isSel = selected === d.id
                return (
                  <li key={d.id}>
                    <label
                      className={`briefing-option ${isSel ? 'is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="briefing-deliverable"
                        checked={isSel}
                        onChange={() => setSelected(d.id)}
                      />
                      <div>
                        <strong>{d.missionTitle}</strong>
                        <span>
                          par {author} ·{' '}
                          {new Date(d.generatedAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </div>
                    </label>
                  </li>
                )
              })}
              {list.length === 0 && (
                <li className="briefing-empty">
                  Aucun livrable archivé pour le moment.
                </li>
              )}
            </ul>

            <footer className="briefing-footer">
              <button type="button" className="briefing-ghost" onClick={close}>
                Annuler
              </button>
              <button
                type="button"
                className="briefing-cta"
                onClick={() => confirm(selected)}
              >
                Confirmer et lancer la mission
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
