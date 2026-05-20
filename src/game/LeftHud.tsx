import { useShallow } from 'zustand/react/shallow'
import { useGame, selectAgentsArray } from './store'

const EURO = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function LeftHud() {
  const venture = useGame((s) => s.ventureName)
  const subtitle = useGame((s) => s.ventureSubtitle)
  const level = useGame((s) => s.level)
  const levelLabel = useGame((s) => s.levelLabel)
  const stage = useGame((s) => s.stage)
  const xp = useGame((s) => s.xp)
  const subscriptionPlan = useGame((s) => s.subscriptionPlan)
  const monthlyCredits = useGame((s) => s.monthlyCredits)
  const creditsUsedThisMonth = useGame((s) => s.creditsUsedThisMonth)
  const realRevenue = useGame((s) => s.realRevenue)
  const credits = useGame((s) => s.credits)
  const reputation = useGame((s) => s.reputation)
  const agents = useGame(useShallow(selectAgentsArray))
  const missions = useGame((s) => s.missions)
  const hqLevel = useGame((s) => s.hqLevel)
  const upgradeHQ = useGame((s) => s.upgradeHQ)
  const selectAgent = useGame((s) => s.selectAgent)
  const selectedId = useGame((s) => s.selectedAgentId)

  const working = agents.filter((a) => a.state === 'working' || a.state === 'walking')
  const delivered = agents.filter((a) => a.state === 'delivered')
  const upgradeCost = 200 + hqLevel * 150
  const creditsRemaining = Math.max(0, monthlyCredits - creditsUsedThisMonth)

  return (
    <aside className="hud hud-left" aria-label="État du projet">
      <header className="hud-head">
        <div className="hud-mark" aria-hidden>
          A
        </div>
        <div>
          <p className="hud-eyebrow">Projet actif</p>
          <h2>{venture}</h2>
          <p className="hud-sub">{subtitle}</p>
        </div>
      </header>

      <section className="hud-card">
        <div className="hud-row">
          <span className="hud-label">Niveau {level}</span>
          <strong className="hud-strong">{levelLabel}</strong>
        </div>
        <div className="hud-row">
          <span className="hud-label">Étape</span>
          <strong>{stage}</strong>
        </div>
      </section>

      <section className="hud-card hud-card-revenue">
        <div className="hud-revenue-head">
          <span className="hud-eyebrow">ROI · Revenus générés</span>
          <span className="hud-revenue-badge">Live</span>
        </div>
        <strong className="hud-revenue-value">{EURO.format(realRevenue)}</strong>
        <p className="hud-muted hud-muted-sm">Vente automatisée des livrables agents.</p>
      </section>

      <section className="hud-card">
        <Gauge
          label={`Crédits du Plan ${subscriptionPlan}`}
          icon="◆"
          value={creditsUsedThisMonth}
          max={monthlyCredits}
          fill="linear-gradient(90deg,#7b7bec,#22d3ee)"
          unit=" crédits"
          footnote={`${creditsRemaining.toLocaleString('fr-FR')} crédits restants ce mois`}
        />
        <Gauge
          label="XP"
          icon="✦"
          value={xp}
          max={500}
          fill="linear-gradient(90deg,#c084fc,#7b7bec)"
        />
        <Gauge
          label="Réputation"
          icon="★"
          value={reputation}
          max={100}
          fill="linear-gradient(90deg,#fbbf24,#f97316)"
        />
        <div className="hud-credits">
          <span>Cash trésorerie</span>
          <strong className="hud-mono">{credits}c</strong>
        </div>
      </section>

      <section className="hud-card">
        <div className="hud-section-title">Validation requise</div>
        {delivered.length === 0 && working.length === 0 && (
          <p className="hud-muted">Aucune action en attente — bureau calme.</p>
        )}
        {delivered.map((a) => (
          <button
            key={a.id}
            type="button"
            className="hud-alert hud-alert-success"
            onClick={() => useGame.getState().completeMission(a.id)}
          >
            <span className="hud-alert-dot" />
            <div>
              <strong>{a.name}</strong>
              <span>Livrable prêt — clique pour valider</span>
            </div>
          </button>
        ))}
        {working.map((a) => (
          <div key={a.id} className="hud-alert hud-alert-info">
            <span className="hud-alert-dot hud-alert-dot-blink" style={{ background: a.themeColor }} />
            <div>
              <strong>{a.name}</strong>
              <span>
                En mission · {Math.round(a.progress * 100)}%
                {a.taskQueue.length > 0 && ` · ${a.taskQueue.length} en file`}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="hud-card">
        <div className="hud-section-title">Roster</div>
        <ul className="hud-roster">
          {agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`hud-roster-item ${selectedId === a.id ? 'is-selected' : ''} ${
                  a.state === 'locked' ? 'is-locked' : ''
                }`}
                onClick={() => selectAgent(a.id)}
              >
                <span
                  className="hud-roster-mark"
                  style={{ background: a.themeColor, opacity: a.state === 'locked' ? 0.3 : 1 }}
                />
                <div>
                  <strong>{a.name}</strong>
                  <span>
                    {a.state === 'locked'
                      ? `Verrouillé · ${a.unlockCost}c`
                      : `Niv. ${a.level} · ${stateLabel(a.state)}`}
                  </span>
                </div>
                {(a.state === 'working' || a.state === 'walking') && (
                  <span className="hud-roster-progress">{Math.round(a.progress * 100)}%</span>
                )}
                {missions[a.id]?.contextDeliverableId && (
                  <span className="hud-roster-context" title="Contexte chargé">
                    Contexte
                  </span>
                )}
                {a.state !== 'locked' && a.taskQueue.length > 0 && (
                  <span className="hud-roster-badge" title={`${a.taskQueue.length} en attente`}>
                    +{a.taskQueue.length}
                  </span>
                )}
                {a.state === 'delivered' && <span className="hud-roster-badge">!</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="hud-card hud-card-hq">
        <div className="hud-section-title">QG · Niv {hqLevel}</div>
        <p className="hud-muted hud-muted-sm">
          Agrandir débloque de nouveaux postes et augmente les crédits inclus dans le plan.
        </p>
        <button
          type="button"
          className="hud-cta"
          onClick={upgradeHQ}
          disabled={credits < upgradeCost}
        >
          <span>Améliorer le QG</span>
          <em>{upgradeCost}c</em>
        </button>
      </section>
    </aside>
  )
}

function Gauge({
  label,
  icon,
  value,
  max,
  fill,
  unit,
  footnote,
}: {
  label: string
  icon: string
  value: number
  max: number
  fill: string
  unit?: string
  footnote?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="hud-gauge">
      <div className="hud-gauge-head">
        <span aria-hidden>{icon}</span>
        <strong>{label}</strong>
        <em className="hud-mono">
          {value.toLocaleString('fr-FR')}/{max.toLocaleString('fr-FR')}
          {unit ?? ''}
        </em>
      </div>
      <div className="hud-gauge-track">
        <div className="hud-gauge-fill" style={{ width: `${pct}%`, background: fill }} />
        <div className="hud-gauge-segments" aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
      {footnote && <p className="hud-gauge-footnote">{footnote}</p>}
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
      return 'Victoire !'
    case 'idle':
      return 'Disponible'
    case 'locked':
      return 'Verrouillé'
    default:
      return s
  }
}
