import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState, type CSSProperties } from 'react'
import { PixelAgent } from './PixelAgent'
import type { AgentStatus } from '../types'
import { getAgents } from '../state'

type OperationalAgent = ReturnType<typeof getAgents>[number]

interface CommandCenterProps {
  agents: OperationalAgent[]
  ventureName: string
  level: number
  levelLabel: string
  stage: string
  energy: number
  workingCount: number
  totalAgents: number
  onOpenAgent: (id: string) => void
}

type ViewMode = 'all' | 'active' | 'recruit'

const AGENT_HEX: Record<string, string> = {
  indigo: '#7B7BEC',
  cyan: '#22D3EE',
  emerald: '#34D399',
  violet: '#C084FC',
  amber: '#FBBF24',
}

export function CommandCenter({
  agents,
  ventureName,
  level,
  levelLabel,
  stage,
  energy,
  workingCount,
  totalAgents,
  onOpenAgent,
}: CommandCenterProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>('all')
  const [spotlightId, setSpotlightId] = useState<string | null>(
    agents.find((a) => a.status !== 'Locked')?.id ?? agents[0]?.id ?? null,
  )

  const filtered = useMemo(() => {
    if (mode === 'active')  return agents.filter((a) => a.status !== 'Locked')
    if (mode === 'recruit') return agents.filter((a) => a.status === 'Locked')
    return agents
  }, [agents, mode])

  const spotlight = useMemo(
    () => agents.find((a) => a.id === spotlightId) ?? agents[0] ?? null,
    [agents, spotlightId],
  )

  // Placement orbital. Le rayon dépend du nombre d'agents pour rester aéré.
  const placed = useMemo(() => {
    const n = filtered.length || 1
    const radius = n <= 3 ? 26 : n <= 5 ? 30 : 33
    // start angle : top, avec un léger décalage pour l'esthétique impair
    const start = n % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2
    return filtered.map((agent, i) => {
      const angle = start + (i / n) * Math.PI * 2
      const cx = 50 + radius * Math.cos(angle)
      const cy = 50 + radius * Math.sin(angle)
      return { agent, cx, cy, angle }
    })
  }, [filtered])

  const counts = useMemo(() => ({
    all: agents.length,
    active: agents.filter((a) => a.status !== 'Locked').length,
    recruit: agents.filter((a) => a.status === 'Locked').length,
  }), [agents])

  return (
    <div className="command-center">
      <div className="cc-header">
        <div>
          <p className="cc-eyebrow">Live Command Center</p>
          <h2>{ventureName}</h2>
          <p className="cc-sub">
            Niveau {level} · {levelLabel} · {stage}
          </p>
        </div>
        <div className="cc-vitals" role="group" aria-label="Vitales QG">
          <Vital label="Agents actifs" value={`${workingCount}/${totalAgents}`} tone="accent" pulse={workingCount > 0} />
          <Vital label="Énergie" value={`${energy}/100`} tone="success" />
          <Vital label="Étape" value={stage.split(' ').slice(0, 2).join(' ')} tone="info" />
        </div>
      </div>

      <div className="cc-stage" role="region" aria-label="Carte du QG">
        {/* Toolbar de modes — interactif, filtre animé */}
        <div className="cc-toolbar" role="tablist" aria-label="Mode de vue du QG">
          <ToolButton active={mode === 'all'}     onClick={() => setMode('all')}     label="Vue d'ensemble" count={counts.all} />
          <ToolButton active={mode === 'active'}  onClick={() => setMode('active')}  label="Mission active" count={counts.active} dot="accent" />
          <ToolButton active={mode === 'recruit'} onClick={() => setMode('recruit')} label="Recrutement"    count={counts.recruit} dot="locked" />
        </div>

        {/* SVG : anneau orbital + arcs courbes Core ↔ agents */}
        <svg
          className="cc-flow-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <filter id="cc-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.45" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {placed.map(({ agent, cx, cy }) => {
              const c = AGENT_HEX[agent.avatar.color] ?? '#7B7BEC'
              return (
                <linearGradient
                  key={agent.id}
                  id={`cc-grad-${agent.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1="50" y1="50" x2={cx} y2={cy}
                >
                  <stop offset="0%"  stopColor={c} stopOpacity="0.9" />
                  <stop offset="60%" stopColor={c} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={c} stopOpacity="0" />
                </linearGradient>
              )
            })}
          </defs>

          {/* Anneau orbital subtil — un seul, pas trois */}
          <circle
            cx="50" cy="50"
            r={placed.length <= 3 ? 26 : placed.length <= 5 ? 30 : 33}
            fill="none"
            stroke="rgba(138, 138, 255, 0.10)"
            strokeWidth="0.18"
            strokeDasharray="0.6 1.2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Arcs courbes Core ↔ agents */}
          {placed.map(({ agent, cx, cy }) => {
            const active = agent.status !== 'Locked'
            const flowing = agent.status === 'Working' || agent.status === 'Result'
            const hovered = hoverId === agent.id
            const selected = spotlight?.id === agent.id
            const c = AGENT_HEX[agent.avatar.color] ?? '#7B7BEC'
            const path = curvedPath(50, 50, cx, cy)
            return (
              <g key={agent.id}>
                {/* trace de base */}
                <path
                  d={path}
                  fill="none"
                  stroke={active ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'}
                  strokeWidth="0.3"
                  strokeLinecap="round"
                  strokeDasharray={active ? undefined : '0.4 0.6'}
                  vectorEffect="non-scaling-stroke"
                />
                {/* trace colorée + glow */}
                {active && (
                  <path
                    d={path}
                    fill="none"
                    stroke={`url(#cc-grad-${agent.id})`}
                    strokeWidth={hovered || selected ? 0.9 : flowing ? 0.55 : 0.32}
                    strokeLinecap="round"
                    filter="url(#cc-glow)"
                    vectorEffect="non-scaling-stroke"
                    style={{ transition: 'stroke-width 0.25s' }}
                  />
                )}
                {/* flow dashed si en mission */}
                {flowing && (
                  <path
                    d={path}
                    fill="none"
                    stroke={c}
                    strokeWidth="0.5"
                    strokeDasharray="1.4 1.6"
                    strokeLinecap="round"
                    className="cc-arc-flow"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* Particules flottant le long des arcs (agents en mission) */}
        {placed.map(({ agent, cx, cy }, i) => {
          if (agent.status !== 'Working' && agent.status !== 'Result') return null
          const c = AGENT_HEX[agent.avatar.color] ?? '#7B7BEC'
          // point de contrôle pour la trajectoire courbe
          const ctrl = controlPoint(50, 50, cx, cy)
          return (
            <FlowParticle
              key={agent.id}
              path={[[50, 50], [ctrl.x, ctrl.y], [cx, cy]]}
              delay={i * 0.45}
              color={c}
            />
          )
        })}

        {/* Autars Core */}
        <motion.div
          className="cc-core"
          animate={{ scale: [1, 1.025, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="cc-core-glow" aria-hidden />
          <div className="cc-core-ring cc-core-ring-1" />
          <div className="cc-core-ring cc-core-ring-2" />
          <div className="cc-core-ring cc-core-ring-3" />
          <div className="cc-core-inner">
            <span className="cc-core-mark">A</span>
            <span className="cc-core-label">Autars Core</span>
            <span className="cc-core-meta">
              <span className="cc-core-dot" /> {workingCount} flux actifs
            </span>
          </div>
        </motion.div>

        {/* Modules agents */}
        <AnimatePresence mode="popLayout">
          {placed.map(({ agent, cx, cy }) => (
            <AgentModule
              key={agent.id}
              agent={agent}
              cx={cx}
              cy={cy}
              selected={spotlight?.id === agent.id}
              onHoverChange={(over) => setHoverId(over ? agent.id : null)}
              onClick={() => {
                setSpotlightId(agent.id)
                if (agent.status !== 'Locked') onOpenAgent(agent.id)
              }}
            />
          ))}
        </AnimatePresence>

        {/* Légende */}
        <div className="cc-legend" aria-hidden>
          <span><i className="dot dot-working" /> En mission</span>
          <span><i className="dot dot-result" /> Livrable prêt</span>
          <span><i className="dot dot-locked" /> Recrutement</span>
        </div>
      </div>

      <div className="cc-inspector">
        <AnimatePresence mode="wait">
          {spotlight && (
            <motion.div
              key={spotlight.id}
              className="cc-inspector-inner"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <div className="cc-inspector-head">
                <PixelAgent color={spotlight.avatar.color} status={spotlight.status} size="sm" />
                <div>
                  <strong>{spotlight.name}</strong>
                  <span>{spotlight.className} · {spotlight.department}</span>
                </div>
                <StatusChip status={spotlight.status} />
              </div>
              <p className="cc-inspector-mission">
                {spotlight.activeMission ? spotlight.activeMission.description : spotlight.unlock ?? spotlight.mission}
              </p>
              <div className="cc-inspector-meta">
                <Meta label="Niveau" value={`Niv. ${spotlight.level}`} />
                <Meta label="Fiabilité" value={`${spotlight.reliability}%`} />
                <Meta label="Progression" value={`${spotlight.progress}%`} />
                {spotlight.activeMission && <Meta label="Impact" value={spotlight.activeMission.impact} />}
              </div>
              {spotlight.status !== 'Locked' && (
                <div className="cc-inspector-bar">
                  <div className="cc-bar-track">
                    <motion.div
                      className="cc-bar-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(spotlight.progress, 6)}%` }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  <span className="cc-bar-label">
                    {spotlight.status === 'Working'
                      ? 'Mission en cours…'
                      : spotlight.status === 'Result'
                      ? 'Livrable prêt — validation requise'
                      : spotlight.status === 'Complete'
                      ? 'Mission terminée'
                      : 'En attente'}
                  </span>
                </div>
              )}
              <button type="button" className="cc-inspector-cta" onClick={() => onOpenAgent(spotlight.id)}>
                Ouvrir la fiche →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ============================================================
   AgentModule — vraie carte d'agent posée sur l'orbite
   ============================================================ */

function AgentModule({
  agent,
  cx,
  cy,
  selected,
  onHoverChange,
  onClick,
}: {
  agent: OperationalAgent
  cx: number
  cy: number
  selected: boolean
  onHoverChange: (over: boolean) => void
  onClick: () => void
}) {
  const locked = agent.status === 'Locked'
  const accent = AGENT_HEX[agent.avatar.color] ?? '#7B7BEC'
  const flowing = agent.status === 'Working' || agent.status === 'Result'

  return (
    <motion.button
      type="button"
      className={`cc-module ${selected ? 'cc-module-selected' : ''} ${locked ? 'cc-module-locked' : ''}`}
      style={{
        left: `${cx}%`,
        top: `${cy}%`,
        ['--module-accent' as string]: accent,
      } as CSSProperties}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.7, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      whileHover={!locked ? { y: -3 } : undefined}
      layout
      aria-label={`Agent ${agent.name} · ${agent.status}`}
    >
      <div className="cc-module-glow" aria-hidden />

      <div className="cc-module-avatar">
        {locked ? (
          <LockedSilhouette />
        ) : (
          <PixelAgent
            color={agent.avatar.color}
            status={agent.status}
            initials={agent.avatar.initials}
            size="md"
            showAura={false}
          />
        )}
        {flowing && <span className="cc-module-flow-dot" aria-hidden />}
      </div>

      <div className="cc-module-status">
        <StatusDot status={agent.status} />
        <span>{shortStatusLabel(agent.status)}</span>
      </div>

      <div className="cc-module-name">
        <strong>{agent.name}</strong>
        <span>{agent.className}</span>
      </div>

      {!locked && (
        <div className="cc-module-progress" aria-hidden>
          <div
            className="cc-module-progress-fill"
            style={{ width: `${Math.max(agent.progress, 6)}%` }}
          />
        </div>
      )}

      {locked && (
        <span className="cc-module-locked-tag">
          Recrutement bloqué
        </span>
      )}
    </motion.button>
  )
}

function LockedSilhouette() {
  return (
    <div className="cc-locked-silhouette" aria-hidden>
      <svg viewBox="0 0 32 36" width="48" height="54">
        {/* Silhouette générique */}
        <circle cx="16" cy="10" r="6.5" fill="currentColor" opacity="0.35" />
        <path
          d="M5 33c0-7 5-12 11-12s11 5 11 12v3H5v-3Z"
          fill="currentColor"
          opacity="0.35"
        />
      </svg>
      <div className="cc-locked-icon" aria-hidden>
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path
            d="M5 7V5a3 3 0 0 1 6 0v2h1v6H4V7h1Zm4 0V5a1 1 0 1 0-2 0v2h2Z"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`cc-status-dot cc-status-${status.toLowerCase()}`} aria-hidden />
}

/* ============================================================
   Helpers
   ============================================================ */

function ToolButton({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  dot?: 'accent' | 'locked'
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`cc-tool-btn ${active ? 'cc-tool-btn-active' : ''}`}
      onClick={onClick}
    >
      {dot && <span className={`cc-tool-dot cc-tool-dot-${dot}`} aria-hidden />}
      <span>{label}</span>
      <span className="cc-tool-count">{count}</span>
    </button>
  )
}

function Vital({ label, value, tone, pulse }: { label: string; value: string; tone: 'accent' | 'success' | 'info'; pulse?: boolean }) {
  return (
    <div className={`cc-vital cc-vital-${tone}`}>
      <span className="cc-vital-label">
        {pulse && <span className="cc-pulse" aria-hidden />}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cc-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusChip({ status }: { status: AgentStatus }) {
  return <span className={`cc-status-chip cc-chip-${status.toLowerCase()}`}>{statusLabel(status)}</span>
}

function FlowParticle({
  path,
  delay,
  color,
}: {
  path: [number, number][]
  delay: number
  color: string
}) {
  const [start, ctrl, end] = path
  // On échantillonne la courbe quadratique en quelques points pour l'animation
  const samples = 8
  const xs: string[] = []
  const ys: string[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const x = (1 - t) * (1 - t) * start![0] + 2 * (1 - t) * t * ctrl![0] + t * t * end![0]
    const y = (1 - t) * (1 - t) * start![1] + 2 * (1 - t) * t * ctrl![1] + t * t * end![1]
    xs.push(`${x}%`)
    ys.push(`${y}%`)
  }
  return (
    <motion.span
      className="cc-particle"
      style={{ '--p-color': color } as CSSProperties}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        left: xs,
        top: ys,
        opacity: [0, 1, 1, 0],
        scale: [0.5, 1, 1, 0.5],
      }}
      transition={{
        duration: 2.2,
        delay,
        repeat: Infinity,
        repeatDelay: 0.6,
        ease: 'easeInOut',
        times: [0, 0.15, 0.85, 1],
      }}
      aria-hidden
    />
  )
}

/* Courbe quadratique entre Core (cx0,cy0) et station (cx1,cy1).
   On décale le point de contrôle perpendiculairement à la ligne
   pour obtenir un arc gracieux qui s'écarte légèrement du centre. */
function curvedPath(cx0: number, cy0: number, cx1: number, cy1: number): string {
  const { x: mx, y: my } = controlPoint(cx0, cy0, cx1, cy1)
  return `M ${cx0} ${cy0} Q ${mx} ${my} ${cx1} ${cy1}`
}

function controlPoint(cx0: number, cy0: number, cx1: number, cy1: number) {
  const midX = (cx0 + cx1) / 2
  const midY = (cy0 + cy1) / 2
  // perpendiculaire normalisée à la ligne
  const dx = cx1 - cx0
  const dy = cy1 - cy0
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  // offset gentil (12% de la longueur)
  const off = len * 0.14
  return { x: midX + px * off, y: midY + py * off }
}

function statusLabel(status: AgentStatus): string {
  const labels: Record<AgentStatus, string> = {
    Ready: 'Disponible',
    Working: 'En mission',
    Waiting: 'En attente',
    Complete: 'Terminé',
    Blocked: 'Bloqué',
    Upgrade: 'À améliorer',
    Result: 'Livrable prêt',
    Locked: 'Verrouillé',
  }
  return labels[status]
}

function shortStatusLabel(status: AgentStatus): string {
  const labels: Record<AgentStatus, string> = {
    Ready:    'Prêt',
    Working:  'En mission',
    Waiting:  'En attente',
    Complete: 'Terminé',
    Blocked:  'Bloqué',
    Upgrade:  'À améliorer',
    Result:   'Livrable prêt',
    Locked:   'Verrouillé',
  }
  return labels[status]
}
