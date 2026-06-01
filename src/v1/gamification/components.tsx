import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import {
  Award,
  Building2,
  ChartBar,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  Compass,
  Crown,
  Flag,
  Gauge,
  Handshake,
  LayoutTemplate,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  Medal,
  Package,
  Palette,
  PenLine,
  Play,
  Rocket,
  Search,
  Sparkles,
  Tag,
  Target,
  Trophy,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type {
  AgentIconKey,
  Badge,
  DimensionScore,
  GamAgent,
  GamMission,
  HQLevel,
  Skin,
} from './types'
import type { GamificationApi } from './state'

const agentIconMap: Record<AgentIconKey, LucideIcon> = {
  compass: Compass,
  search: Search,
  palette: Palette,
  package: Package,
  tag: Tag,
  layout: LayoutTemplate,
  megaphone: Megaphone,
  handshake: Handshake,
  pen: PenLine,
  chart: ChartBar,
}

const badgeIconMap: Record<Badge['icon'], LucideIcon> = {
  compass: Compass,
  search: Search,
  palette: Palette,
  package: Package,
  tag: Tag,
  layout: LayoutTemplate,
  megaphone: Megaphone,
  handshake: Handshake,
  pen: PenLine,
  chart: ChartBar,
  flag: Flag,
  trophy: Trophy,
  wallet: Wallet,
  rocket: Rocket,
  crown: Crown,
}

const statusLabel: Record<GamAgent['status'], string> = {
  idle: 'En veille',
  working: 'En mission',
  waiting_validation: 'Attente validation',
  completed: 'À jour',
  locked: 'Verrouillé',
}

const missionStatusLabel: Record<GamMission['status'], string> = {
  locked: 'Verrouillée',
  available: 'Disponible',
  in_progress: 'En cours',
  completed: 'À valider',
  validated: 'Validée',
}

export function HQProgressHeader({
  api,
  projectName,
}: {
  api: GamificationApi
  projectName: string
}) {
  const { hqLevel, nextLevel, xp, xpForNextLevel, xpProgressInLevel, scoreBusiness, nextBestMission } = api
  return (
    <section className="gam-hq-header" aria-label="Progression du QG">
      <div className="gam-hq-header-grid">
        <div className="gam-hq-card gam-hq-level">
          <div className="gam-hq-kicker">
            <Building2 size={14} />
            <span>QG · {projectName}</span>
          </div>
          <div className="gam-hq-level-row">
            <div className="gam-hq-level-badge" data-level={hqLevel.level}>
              <span>{hqLevel.level}</span>
            </div>
            <div>
              <strong>{hqLevel.name}</strong>
              <p>{hqLevel.description}</p>
            </div>
          </div>
          <div className="gam-xp-bar" aria-label="Progression XP">
            <div className="gam-xp-bar-track">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${xpProgressInLevel}%` }}
                transition={{ type: 'spring', stiffness: 110, damping: 22 }}
              />
            </div>
            <div className="gam-xp-bar-meta">
              <span>
                <Zap size={13} /> {xp} XP
              </span>
              <span>
                {xpForNextLevel === null
                  ? 'Niveau max atteint'
                  : `${xpForNextLevel - xp} XP avant Niv. ${nextLevel?.level}`}
              </span>
            </div>
          </div>
        </div>

        <div className="gam-hq-card gam-hq-score">
          <div className="gam-hq-kicker">
            <Gauge size={14} />
            <span>Score Business</span>
          </div>
          <div className="gam-hq-score-value">
            <strong>{scoreBusiness}</strong>
            <span>/100</span>
          </div>
          <div className="gam-hq-score-line">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${scoreBusiness}%` }}
              transition={{ duration: 0.7 }}
            />
          </div>
          <p className="gam-hq-score-hint">
            Indicateur global de maturité business : clarté, offre, acquisition, exécution, traction.
          </p>
        </div>

        <div className="gam-hq-card gam-hq-next">
          <div className="gam-hq-kicker">
            <Sparkles size={14} />
            <span>Prochaine étape</span>
          </div>
          {nextBestMission ? (
            <>
              <strong>{nextBestMission.title}</strong>
              <p>{nextBestMission.description}</p>
              <div className="gam-next-meta">
                <span>
                  <Zap size={13} /> +{nextBestMission.xpReward} XP
                </span>
                <span>
                  <Target size={13} /> {nextBestMission.expectedDeliverable}
                </span>
              </div>
            </>
          ) : (
            <>
              <strong>Toutes les missions accessibles sont terminées.</strong>
              <p>Continuez à pousser le QG, débloquez le prochain niveau.</p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export function BusinessScoreCard({ scores }: { scores: DimensionScore[] }) {
  return (
    <section className="dashboard-section gam-score-card">
      <header>
        <div>
          <h2>Score business détaillé</h2>
          <p>Cinq dimensions, une lecture nette de la maturité du projet.</p>
        </div>
        <span>{scores.length} axes</span>
      </header>
      <ul className="gam-dimension-list">
        {scores.map((dim) => (
          <li key={dim.dimension}>
            <div className="gam-dim-row">
              <span>{dim.label}</span>
              <strong>{dim.value}/100</strong>
            </div>
            <div className="gam-dim-bar">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${dim.value}%` }}
                transition={{ duration: 0.6 }}
                data-dim={dim.dimension}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NextBestMission({ mission, onStart }: { mission: GamMission | null; onStart: (id: string) => void }) {
  if (!mission) return null
  const isActive = mission.status === 'in_progress'
  return (
    <article className="gam-next-card">
      <div className="gam-next-card-head">
        <div className="gam-next-card-pill">
          <Sparkles size={14} /> Mission recommandée
        </div>
        <span className={`gam-mission-status status-${mission.status}`}>
          {missionStatusLabel[mission.status]}
        </span>
      </div>
      <h3>{mission.title}</h3>
      <p>{mission.description}</p>
      <ul className="gam-next-criteria">
        {mission.validationCriteria.map((c) => (
          <li key={c}>
            <CircleCheck size={14} />
            {c}
          </li>
        ))}
      </ul>
      <footer className="gam-next-foot">
        <div>
          <span>
            <Zap size={14} /> +{mission.xpReward} XP
          </span>
          <span>
            <Target size={14} /> {mission.expectedDeliverable}
          </span>
        </div>
        <button
          type="button"
          className="primary-cta gam-next-cta"
          onClick={() => onStart(mission.id)}
          disabled={isActive}
        >
          {isActive ? 'Mission en cours' : 'Démarrer'}
          <ChevronRight size={16} />
        </button>
      </footer>
    </article>
  )
}

export function MissionsRoadmap({
  missions,
  agents,
  onStart,
  onValidate,
}: {
  missions: GamMission[]
  agents: GamAgent[]
  onStart: (id: string) => void
  onValidate: (id: string) => void
}) {
  return (
    <section className="dashboard-section gam-roadmap">
      <header>
        <div>
          <h2>Roadmap business</h2>
          <p>Chaque mission produit un actif réel : pitch, offre, page, lead, client, revenu.</p>
        </div>
        <span>{missions.filter((m) => m.status === 'validated').length}/{missions.length} validées</span>
      </header>
      <ol className="gam-mission-list">
        {missions.map((mission, idx) => {
          const agent = agents.find((a) => a.id === mission.agentId)
          const Icon = agent ? agentIconMap[agent.icon] : Target
          const isLocked = mission.status === 'locked'
          return (
            <motion.li
              key={mission.id}
              className={`gam-mission-row gam-mission-${mission.status}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
            >
              <div className="gam-mission-step">
                <span>{idx + 1}</span>
                {isLocked ? <LockKeyhole size={12} /> : null}
              </div>
              <div className="gam-mission-agent">
                <span
                  className="gam-agent-avatar"
                  style={{ '--accent': agent?.accent ?? '#6c6ce3' } as CSSProperties}
                >
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{mission.title}</strong>
                  <p>{mission.description}</p>
                </div>
              </div>
              <div className="gam-mission-meta">
                <span className={`gam-mission-status status-${mission.status}`}>
                  {missionStatusLabel[mission.status]}
                </span>
                <span className="gam-mission-xp">
                  <Zap size={12} /> +{mission.xpReward} XP
                </span>
                <span className="gam-mission-deliverable">
                  <Target size={12} /> {mission.expectedDeliverable}
                </span>
              </div>
              <div className="gam-mission-actions">
                {mission.status === 'available' && (
                  <button type="button" onClick={() => onStart(mission.id)}>
                    <Play size={13} /> Démarrer
                  </button>
                )}
                {mission.status === 'in_progress' && (
                  <span className="gam-mission-working">
                    <CircleCheck size={13} /> Agent au travail…
                  </span>
                )}
                {mission.status === 'completed' && (
                  <button type="button" className="gam-validate-btn" onClick={() => onValidate(mission.id)}>
                    <Award size={13} /> Valider le livrable
                  </button>
                )}
                {mission.status === 'validated' && (
                  <span className="gam-mission-done">
                    <CircleCheck size={13} /> Validée
                  </span>
                )}
                {mission.status === 'locked' && (
                  <span className="gam-mission-lock">
                    <LockKeyhole size={12} /> Nécessite Niv. {mission.hqLevelRequired}
                  </span>
                )}
              </div>
            </motion.li>
          )
        })}
      </ol>
    </section>
  )
}

export function AgentGamificationCard({
  agent,
  onSelectSkin,
  skins,
}: {
  agent: GamAgent
  onSelectSkin: (agentId: string, skinId: string) => void
  skins: Skin[]
}) {
  const Icon = agentIconMap[agent.icon]
  const xpForLevel = [0, 100, 250, 500, 900, 1500]
  const current = xpForLevel[Math.min(agent.level - 1, 5)] ?? 0
  const next = xpForLevel[Math.min(agent.level, 5)] ?? current
  const progress =
    next > current ? Math.min(100, Math.round(((agent.xp - current) / (next - current)) * 100)) : 100

  const agentSkins = skins.filter(
    (s) => s.type === 'agent' && (s.targetId === agent.id || s.targetId === undefined),
  )

  return (
    <article
      className={`gam-agent-card gam-agent-${agent.status}`}
      style={{ '--accent': agent.accent } as CSSProperties}
    >
      <div className="gam-agent-head">
        <span className="gam-agent-portrait">
          <Icon size={20} />
        </span>
        <div className="gam-agent-id">
          <strong>{agent.name}</strong>
          <span>Niv. {agent.level} · {statusLabel[agent.status]}</span>
        </div>
        {agent.status === 'locked' ? (
          <LockKeyhole size={16} className="gam-agent-lock" />
        ) : (
          <Medal size={16} className="gam-agent-medal" />
        )}
      </div>
      <p className="gam-agent-role">{agent.role}</p>

      <div className="gam-agent-xp">
        <div className="gam-agent-xp-bar">
          <motion.span
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        <div className="gam-agent-xp-meta">
          <span>{agent.xp} XP</span>
          <span>
            {agent.level >= 5 ? 'Niveau max' : `${agent.xpToNextLevel} XP avant Niv. ${agent.level + 1}`}
          </span>
        </div>
      </div>

      {agent.status !== 'locked' && (
        <div className="gam-agent-skins">
          <span className="gam-agent-skins-label">Skin</span>
          <div className="gam-agent-skin-row">
            {agentSkins.map((skin) => {
              const unlocked = agent.unlockedSkinIds.includes(skin.id)
              const active = agent.activeSkinId === skin.id
              return (
                <button
                  type="button"
                  key={skin.id}
                  className={`gam-skin-chip rarity-${skin.rarity} ${active ? 'is-active' : ''} ${unlocked ? '' : 'is-locked'}`}
                  disabled={!unlocked}
                  onClick={() => onSelectSkin(agent.id, skin.id)}
                  title={unlocked ? skin.name : skin.unlockCondition}
                >
                  {unlocked ? skin.name : <LockKeyhole size={12} />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {agent.status === 'locked' && (
        <div className="gam-agent-lock-hint">
          <LockKeyhole size={13} /> Débloque au QG Niv. {agent.hqLevelRequired}
        </div>
      )}
    </article>
  )
}

export function AgentsGamificationGrid({
  agents,
  skins,
  onSelectSkin,
}: {
  agents: GamAgent[]
  skins: Skin[]
  onSelectSkin: (agentId: string, skinId: string) => void
}) {
  return (
    <section className="dashboard-section gam-agents-section">
      <header>
        <div>
          <h2>Agents IA — niveaux de copilotage</h2>
          <p>Chaque agent monte en niveau quand il produit des livrables validés.</p>
        </div>
        <span>{agents.filter((a) => a.status !== 'locked').length} actifs</span>
      </header>
      <div className="gam-agents-grid">
        {agents.map((agent) => (
          <AgentGamificationCard
            key={agent.id}
            agent={agent}
            skins={skins}
            onSelectSkin={onSelectSkin}
          />
        ))}
      </div>
    </section>
  )
}

export function BusinessBadges({ badges }: { badges: Badge[] }) {
  const unlocked = badges.filter((b) => b.unlocked).length
  return (
    <section className="dashboard-section gam-badges">
      <header>
        <div>
          <h2>Trophées business</h2>
          <p>Chaque trophée représente une étape entrepreneuriale réelle.</p>
        </div>
        <span>
          {unlocked}/{badges.length} débloqués
        </span>
      </header>
      <div className="gam-badge-grid">
        {badges.map((badge) => {
          const Icon = badgeIconMap[badge.icon]
          return (
            <article
              key={badge.id}
              className={`gam-badge ${badge.unlocked ? 'is-unlocked' : 'is-locked'} cat-${badge.category}`}
            >
              <span className="gam-badge-icon">
                {badge.unlocked ? <Icon size={20} /> : <LockKeyhole size={18} />}
              </span>
              <strong>{badge.name}</strong>
              <p>{badge.unlocked ? badge.description : badge.unlockCondition}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function SkinsPanel({
  skins,
  agents,
  activeHQSkinId,
  hqLevel,
  onSelectHQSkin,
}: {
  skins: Skin[]
  agents: GamAgent[]
  activeHQSkinId: string
  hqLevel: HQLevel
  onSelectHQSkin: (skinId: string) => void
}) {
  const hqSkins = skins.filter((s) => s.type === 'hq')
  const agentSkins = skins.filter((s) => s.type === 'agent' && s.targetId)
  return (
    <section className="dashboard-section gam-skins">
      <header>
        <div>
          <h2>Skins de progression</h2>
          <p>L’apparence du QG et des agents évolue avec votre business.</p>
        </div>
        <span>QG Niv. {hqLevel.level}</span>
      </header>

      <div className="gam-skins-subhead">
        <Building2 size={14} /> QG
      </div>
      <div className="gam-skins-grid">
        {hqSkins.map((skin) => {
          const active = activeHQSkinId === skin.id
          return (
            <button
              type="button"
              key={skin.id}
              className={`gam-skin-card rarity-${skin.rarity} ${skin.unlocked ? '' : 'is-locked'} ${active ? 'is-active' : ''}`}
              disabled={!skin.unlocked}
              onClick={() => onSelectHQSkin(skin.id)}
            >
              <div className="gam-skin-preview" data-level={skin.targetId}>
                {skin.unlocked ? <Lightbulb size={20} /> : <LockKeyhole size={18} />}
              </div>
              <strong>{skin.name}</strong>
              <p>{skin.unlocked ? skin.description : skin.unlockCondition}</p>
              <span className={`gam-skin-rarity rarity-${skin.rarity}`}>{skin.rarity}</span>
            </button>
          )
        })}
      </div>

      <div className="gam-skins-subhead">
        <ChartColumn size={14} /> Skins agents
      </div>
      <div className="gam-skins-grid">
        {agentSkins.map((skin) => {
          const agent = agents.find((a) => a.id === skin.targetId)
          return (
            <div
              key={skin.id}
              className={`gam-skin-card rarity-${skin.rarity} ${skin.unlocked ? '' : 'is-locked'}`}
            >
              <div className="gam-skin-preview" style={{ '--accent': agent?.accent ?? '#6c6ce3' } as CSSProperties}>
                {skin.unlocked ? <Trophy size={20} /> : <LockKeyhole size={18} />}
              </div>
              <strong>{skin.name}</strong>
              <p>
                <em>{agent?.name ?? 'Agent'}</em>{' '}
                {skin.unlocked ? skin.description : `— ${skin.unlockCondition}`}
              </p>
              <span className={`gam-skin-rarity rarity-${skin.rarity}`}>{skin.rarity}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
