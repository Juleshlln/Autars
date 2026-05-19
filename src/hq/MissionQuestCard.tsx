import { motion } from 'framer-motion'
import type { Mission, MissionStatus } from '../types'
import { getAgents } from '../state'
import { PixelAgent } from './PixelAgent'

type OperationalAgent = ReturnType<typeof getAgents>[number]

interface MissionQuestCardProps {
  mission: Mission
  status: MissionStatus
  agents: OperationalAgent[]
  onAction: (m: Mission) => void
}

/**
 * Carte de quête : présente une mission comme une quête de jeu de gestion.
 * - Halo coloré selon la rareté
 * - Avatars des agents assignés
 * - Récompenses sous forme de "loot tags"
 * - Bouton d'action contextuel (Préparer / Revoir / Verrouillé)
 */
export function MissionQuestCard({ mission, status, agents, onAction }: MissionQuestCardProps) {
  const locked = status === 'locked'
  const done = status === 'completed'
  const playable = status === 'available'

  const assignedAgents = agents.filter((a) => mission.assignedAgentIds.includes(a.id))
  const rarityClass = `quest-rarity-${mission.rarity.toLowerCase()}`

  return (
    <motion.article
      className={`quest-card ${rarityClass} quest-${status}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={!locked ? { y: -4 } : undefined}
    >
      <div className="quest-glow" aria-hidden />
      {locked && <div className="quest-locked-overlay" aria-hidden>VERROUILLÉ</div>}

      <header className="quest-head">
        <div className="quest-index">
          <span className="mono">M{String(mission.index).padStart(2, '0')}</span>
          <span className={`quest-rarity-pill ${rarityClass}`}>{mission.rarity}</span>
        </div>
        <h3 className="quest-title">{mission.title}</h3>
        <p className="quest-desc">{mission.description}</p>
      </header>

      <div className="quest-agents" aria-label="Agents assignés">
        {assignedAgents.map((a) => (
          <div key={a.id} className="quest-agent">
            <PixelAgent
              color={a.avatar.color}
              status={playable ? 'Working' : done ? 'Complete' : 'Ready'}
              size="sm"
              showAura={false}
            />
            <span>{a.name}</span>
          </div>
        ))}
      </div>

      <div className="quest-stats">
        <Stat icon="⏱" label="Durée" value={mission.estimatedTime} />
        <Stat icon="⚡" label="Énergie" value={`${mission.energyCost}/100`} />
        <Stat icon="◆" label="Difficulté" value={mission.difficulty} />
        <Stat icon="↗" label="Impact" value={mission.impact} />
      </div>

      <div className="quest-rewards">
        <span className="quest-rewards-label">Récompenses</span>
        <div className="quest-loot">
          <Loot kind="xp">{mission.reward}</Loot>
          <Loot kind="asset">{mission.output}</Loot>
          {done && <Loot kind="done">Validée</Loot>}
        </div>
      </div>

      <div className="quest-action">
        {playable && (
          <button type="button" className="quest-btn quest-btn-primary" onClick={() => onAction(mission)}>
            <span>Préparer la mission</span>
            <span aria-hidden>→</span>
          </button>
        )}
        {done && (
          <button type="button" className="quest-btn quest-btn-secondary" onClick={() => onAction(mission)}>
            <span>Revoir le livrable</span>
            <span aria-hidden>→</span>
          </button>
        )}
        {locked && (
          <button type="button" className="quest-btn quest-btn-locked" disabled>
            <span>Prérequis · {mission.required ?? 'Mission précédente'}</span>
          </button>
        )}
      </div>
    </motion.article>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="quest-stat">
      <span className="quest-stat-icon" aria-hidden>{icon}</span>
      <span className="quest-stat-label">{label}</span>
      <strong className="quest-stat-value">{value}</strong>
    </div>
  )
}

function Loot({ kind, children }: { kind: 'xp' | 'asset' | 'done'; children: string }) {
  return <span className={`quest-loot-chip quest-loot-${kind}`}>{children}</span>
}
