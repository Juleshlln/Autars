import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, type Venture } from './store'

import './hub.css'

interface Props {
  onEnterHQ: (ventureId: string) => void
}

export function HubScreen({ onEnterHQ }: Props) {
  const ventures = useGame(
    useShallow((s) => s.ventureOrder.map((id) => s.ventures[id]).filter(Boolean) as Venture[]),
  )
  const founderName = useGame((s) => s.founderName)
  const founderLevel = useGame((s) => s.founderLevel)
  const founderTitle = useGame((s) => s.founderTitle)
  const activeId = useGame((s) => s.activeVentureId)
  const openNewVentureModal = useGame((s) => s.openNewVentureModal)

  const kpis = useMemo(() => {
    const totalMRR = ventures.reduce((a, v) => a + v.monthlyRevenue, 0)
    const activeVentures = ventures.filter((v) => v.status === 'active').length
    const totalAgents = ventures.reduce((a, v) => a + v.agentCount, 0)
    return { totalMRR, activeVentures, totalAgents }
  }, [ventures])

  return (
    <div className="hub-screen">
      <div className="hub-bg" aria-hidden />

      <header className="hub-header">
        <div className="hub-brand">
          <div className="hub-brand-mark">A</div>
          <div>
            <p className="hub-eyebrow">Autars Holding</p>
            <h1>Hub de commandement</h1>
          </div>
        </div>
        <div className="hub-profile">
          <div className="hub-profile-info">
            <strong>{founderName}</strong>
            <span>
              {founderTitle} · Niv. {founderLevel}
            </span>
          </div>
          <div className="hub-profile-avatar" aria-hidden>
            {founderName
              .split(' ')
              .map((s) => s[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
        </div>
      </header>

      <section className="hub-kpis" aria-label="Statistiques globales du portefeuille">
        <Kpi
          label="MRR consolidé"
          value={`${formatNumber(kpis.totalMRR)} €`}
          trend="+18% ce mois"
        />
        <Kpi label="Filiales actives" value={`${kpis.activeVentures}/${ventures.length}`} />
        <Kpi label="Agents en réseau" value={`${kpis.totalAgents}`} trend="+1 cette semaine" />
        <Kpi label="Score investisseur" value="78" trend="+4 pts" />
      </section>

      <section className="hub-ventures" aria-label="Liste des filiales">
        <header className="hub-section-head">
          <div>
            <h2>Vos filiales</h2>
            <p>Sélectionnez une compagnie pour piloter son QG en temps réel.</p>
          </div>
          <button type="button" className="hub-launch" onClick={openNewVentureModal}>
            <span>＋ Lancer une nouvelle filiale</span>
          </button>
        </header>

        <div className="hub-cards">
          {ventures.map((v, i) => (
            <motion.article
              key={v.id}
              className={`hub-card hub-card-${v.status} ${
                activeId === v.id ? 'is-active' : ''
              }`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <header className="hub-card-head">
                <div className="hub-card-tag" style={{ background: v.themeColor }} />
                <div className="hub-card-titles">
                  <p className="hub-eyebrow">{v.industry}</p>
                  <h3>{v.name}</h3>
                  <p className="hub-card-sub">{v.subtitle}</p>
                </div>
                <span className={`hub-card-status hub-card-status-${v.status}`}>
                  {statusLabel(v.status)}
                </span>
              </header>

              <p className="hub-card-tagline">"{v.tagline}"</p>

              <div className="hub-card-grid">
                <div>
                  <span>MRR</span>
                  <strong>{formatNumber(v.monthlyRevenue)} €</strong>
                </div>
                <div>
                  <span>Agents</span>
                  <strong>{v.agentCount}</strong>
                </div>
                <div>
                  <span>Niveau</span>
                  <strong>
                    {v.level} · {v.levelLabel}
                  </strong>
                </div>
                <div>
                  <span>Étape</span>
                  <strong>{v.stage}</strong>
                </div>
              </div>

              <footer className="hub-card-foot">
                <span className="hub-card-meta">{v.launchedLabel}</span>
                <button
                  type="button"
                  className={`hub-card-cta ${v.status !== 'active' ? 'is-disabled' : ''}`}
                  disabled={v.status !== 'active'}
                  onClick={() => onEnterHQ(v.id)}
                >
                  {v.status === 'active' ? 'Entrer dans le QG →' : 'Bientôt disponible'}
                </button>
              </footer>
            </motion.article>
          ))}

          <motion.article
            className="hub-card hub-card-add"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ventures.length * 0.06, ease: [0.16, 1, 0.3, 1] }}
            onClick={openNewVentureModal}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openNewVentureModal()
            }}
          >
            <div className="hub-add-icon" aria-hidden>
              ＋
            </div>
            <h3>Nouvelle filiale</h3>
            <p>Brief, agents recrutables, marché cible — préparez votre prochaine compagnie.</p>
            <button
              type="button"
              className="hub-card-cta hub-card-cta-ghost"
              onClick={(e) => {
                e.stopPropagation()
                openNewVentureModal()
              }}
            >
              Démarrer un brief
            </button>
          </motion.article>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <div className="hub-kpi">
      <span className="hub-eyebrow">{label}</span>
      <strong>{value}</strong>
      {trend && <em>{trend}</em>}
    </div>
  )
}

function formatNumber(n: number) {
  return n.toLocaleString('fr-FR')
}

function statusLabel(s: Venture['status']) {
  switch (s) {
    case 'active':
      return 'Active'
    case 'incubating':
      return 'Incubation'
    case 'paused':
      return 'En pause'
    default:
      return s
  }
}
