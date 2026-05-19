import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from './store'

const EURO = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function OfflineReportModal() {
  const open = useGame((s) => s.showOfflineReport)
  const report = useGame((s) => s.offlineReport)
  const close = useGame((s) => s.closeOfflineReport)
  const collect = useGame((s) => s.collectOfflineReport)

  return (
    <AnimatePresence>
      {open && report && (
        <motion.div
          key="offline-overlay"
          className="offline-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          aria-modal
          role="dialog"
          aria-label="Rapport d'absence"
        >
          <motion.div
            className="offline-modal"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="offline-close"
              aria-label="Fermer"
              onClick={close}
            >
              ×
            </button>

            <header className="offline-head">
              <span className="offline-eyebrow">Rapport d'activité hors-ligne</span>
              <h2>Pendant votre absence…</h2>
              <p className="offline-sub">
                Vos agents IA ont continué à exécuter les missions de votre file pendant que
                vous étiez déconnecté.
              </p>
            </header>

            <section className="offline-summary">
              <p className="offline-summary-lead">
                <strong>{report.agentName}</strong> a terminé{' '}
                <strong>
                  {report.tasksCompleted} tâche{report.tasksCompleted > 1 ? 's' : ''}
                </strong>
                . Coût total : <strong>{report.creditsSpent} crédits</strong>. Livrables
                générés et prêts à être encaissés.
              </p>

              <div className="offline-stats">
                <div className="offline-stat">
                  <span>Tâches terminées</span>
                  <strong>{report.tasksCompleted}</strong>
                </div>
                <div className="offline-stat">
                  <span>Crédits consommés</span>
                  <strong>{report.creditsSpent.toLocaleString('fr-FR')}</strong>
                </div>
                <div className="offline-stat offline-stat-accent">
                  <span>Revenu généré</span>
                  <strong>{EURO.format(report.revenueGenerated)}</strong>
                </div>
              </div>
            </section>

            <section className="offline-deliverables">
              <h3>Livrables prêts</h3>
              <ul>
                {report.deliverableTitles.map((title, i) => (
                  <li key={i}>
                    <span className="offline-deliverable-dot" />
                    {title}
                  </li>
                ))}
              </ul>
            </section>

            <footer className="offline-footer">
              <button type="button" className="offline-cta" onClick={collect}>
                Récolter les livrables · +{EURO.format(report.revenueGenerated)}
              </button>
              <button type="button" className="offline-ghost" onClick={close}>
                Plus tard
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
