import { motion, type Variants } from 'framer-motion'
import type { CSSProperties } from 'react'
import type { AgentStatus } from '../types'

/**
 * PixelAgent — avatar pixel art animé d'un agent IA.
 *
 * Rendu : grille SVG 16×16 mise à l'échelle. La silhouette est partagée,
 * la peau / les vêtements héritent de la couleur de l'agent via CSS vars.
 *
 * États supportés :
 *  - Ready / Working / Waiting / Complete / Blocked / Upgrade / Result / Locked
 *
 * Chaque état déclenche :
 *  - une animation de corps (idle bob, typing, scan, célébration, sommeil)
 *  - une couleur d'aura / glow
 *  - une bulle de pensée (status bubble) si activée
 */

const SKIN = '#F3CDA4'
const SKIN_DARK = '#D89B6A'
const OUTLINE = '#0B0D11'
const WHITE = '#F4F5F7'

const AGENT_COLORS: Record<string, { primary: string; dark: string; glow: string }> = {
  indigo:  { primary: '#7B7BEC', dark: '#4848B5', glow: 'rgba(138, 138, 255, 0.55)' },
  cyan:    { primary: '#22D3EE', dark: '#0E7490', glow: 'rgba(34, 211, 238, 0.55)' },
  emerald: { primary: '#34D399', dark: '#047857', glow: 'rgba(52, 211, 153, 0.55)' },
  violet:  { primary: '#C084FC', dark: '#7E22CE', glow: 'rgba(192, 132, 252, 0.55)' },
  amber:   { primary: '#FBBF24', dark: '#B45309', glow: 'rgba(251, 191, 36, 0.55)' },
}

export type PixelAgentSize = 'sm' | 'md' | 'lg'

interface PixelAgentProps {
  color: string
  status: AgentStatus
  initials?: string
  size?: PixelAgentSize
  bubble?: string
  bubblePosition?: 'top' | 'bottom'
  showAura?: boolean
  className?: string
}

const SIZE_PX: Record<PixelAgentSize, number> = { sm: 48, md: 72, lg: 112 }

export function PixelAgent({
  color,
  status,
  initials,
  size = 'md',
  bubble,
  bubblePosition = 'top',
  showAura = true,
  className = '',
}: PixelAgentProps) {
  const palette = AGENT_COLORS[color] ?? AGENT_COLORS.indigo!
  const px = SIZE_PX[size]
  const locked = status === 'Locked'

  const style = {
    '--pa-primary': palette.primary,
    '--pa-dark': palette.dark,
    '--pa-glow': palette.glow,
    width: px,
    height: px,
  } as CSSProperties

  return (
    <div className={`pixel-agent pixel-agent-${size} pa-${status.toLowerCase()} ${className}`} style={style}>
      {showAura && !locked && <div className="pa-aura" aria-hidden />}
      {showAura && status === 'Working' && <div className="pa-particles" aria-hidden />}

      <motion.div className="pa-body-wrap" variants={bodyVariants} animate={statusAnimation(status)} aria-hidden>
        <PixelBody status={status} initials={initials} />
      </motion.div>

      {bubble && !locked && (
        <motion.div
          className={`pa-bubble pa-bubble-${bubblePosition}`}
          initial={{ opacity: 0, y: bubblePosition === 'top' ? 4 : -4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <span>{bubble}</span>
        </motion.div>
      )}

      {locked && (
        <div className="pa-lock" aria-hidden>
          <svg viewBox="0 0 12 12" width="14" height="14">
            <path d="M3 5V3.5a3 3 0 0 1 6 0V5h1v6H2V5h1Zm4 0V3.5a1 1 0 0 0-2 0V5h2Z" fill="currentColor" />
          </svg>
        </div>
      )}

      {status === 'Result' && (
        <motion.div
          className="pa-result-pop"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, type: 'spring', stiffness: 240 }}
          aria-hidden
        >
          ✓
        </motion.div>
      )}
    </div>
  )
}

function statusAnimation(status: AgentStatus): string {
  switch (status) {
    case 'Working':  return 'working'
    case 'Waiting':  return 'waiting'
    case 'Result':
    case 'Complete': return 'celebrate'
    case 'Blocked':  return 'blocked'
    case 'Upgrade':  return 'upgrade'
    case 'Locked':   return 'locked'
    default:         return 'idle'
  }
}

const bodyVariants: Variants = {
  idle:      { y: [0, -2, 0],         transition: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } },
  working:   { y: [0, -1, 0, 1, 0],   rotate: [0, 1.5, 0, -1.5, 0], transition: { duration: 0.55, repeat: Infinity, ease: 'easeInOut' } },
  waiting:   { y: [0, -1, 0],         transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } },
  celebrate: { y: [0, -6, 0, -3, 0],  transition: { duration: 1.1, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' } },
  blocked:   { x: [0, -2, 2, -2, 2, 0], transition: { duration: 0.55, repeat: Infinity, repeatDelay: 1.8 } },
  upgrade:   { y: [0, -3, 0],         transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } },
  locked:    { y: 0, opacity: 0.55 },
}

/* -------------------- Pixel body (inline SVG) -------------------- */

function PixelBody({ status, initials }: { status: AgentStatus; initials?: string }) {
  const eyes = eyesForStatus(status)
  const mouth = mouthForStatus(status)

  return (
    <svg viewBox="0 0 16 22" className="pa-svg" shapeRendering="crispEdges">
      {/* Head */}
      <rect x="4" y="2"  width="8" height="1" fill={OUTLINE} />
      <rect x="3" y="3"  width="1" height="5" fill={OUTLINE} />
      <rect x="12" y="3" width="1" height="5" fill={OUTLINE} />
      <rect x="4" y="8"  width="8" height="1" fill={OUTLINE} />
      <rect x="4" y="3"  width="8" height="5" fill={SKIN} />
      <rect x="4" y="7"  width="8" height="1" fill={SKIN_DARK} />

      {/* Hair / cap (color slot) */}
      <rect x="4" y="3"  width="8" height="2" fill="var(--pa-dark)" />
      <rect x="3" y="3"  width="1" height="1" fill="var(--pa-dark)" />
      <rect x="12" y="3" width="1" height="1" fill="var(--pa-dark)" />

      {/* Eyes (animated via key swap on status) */}
      <Eyes kind={eyes} />

      {/* Mouth */}
      <Mouth kind={mouth} />

      {/* Neck */}
      <rect x="6" y="9"  width="4" height="1" fill={SKIN_DARK} />

      {/* Torso outline */}
      <rect x="3" y="10" width="10" height="1" fill={OUTLINE} />
      <rect x="2" y="11" width="1" height="7"  fill={OUTLINE} />
      <rect x="13" y="11" width="1" height="7" fill={OUTLINE} />
      <rect x="3" y="18" width="10" height="1" fill={OUTLINE} />

      {/* Torso fill (primary color) */}
      <rect x="3" y="11" width="10" height="7" fill="var(--pa-primary)" />
      <rect x="3" y="17" width="10" height="1" fill="var(--pa-dark)" />

      {/* Collar / vest accent */}
      <rect x="7" y="11" width="2" height="3" fill={WHITE} opacity="0.85" />
      <rect x="7" y="12" width="2" height="1" fill="var(--pa-dark)" />

      {/* Arms (animated for working/typing) */}
      <motion.g
        variants={armVariants}
        animate={status === 'Working' ? 'typing' : status === 'Result' || status === 'Complete' ? 'wave' : status === 'Blocked' ? 'cross' : 'rest'}
        style={{ transformOrigin: '8px 13px' }}
      >
        <rect x="1" y="12" width="2" height="4" fill="var(--pa-primary)" />
        <rect x="1" y="11" width="2" height="1" fill={OUTLINE} />
        <rect x="0" y="12" width="1" height="4" fill={OUTLINE} />
        <rect x="1" y="16" width="2" height="1" fill={OUTLINE} />
        <rect x="13" y="12" width="2" height="4" fill="var(--pa-primary)" />
        <rect x="13" y="11" width="2" height="1" fill={OUTLINE} />
        <rect x="15" y="12" width="1" height="4" fill={OUTLINE} />
        <rect x="13" y="16" width="2" height="1" fill={OUTLINE} />
      </motion.g>

      {/* Legs */}
      <rect x="4" y="19" width="3" height="3" fill="#1F2632" />
      <rect x="9" y="19" width="3" height="3" fill="#1F2632" />
      <rect x="4" y="19" width="3" height="1" fill={OUTLINE} />
      <rect x="9" y="19" width="3" height="1" fill={OUTLINE} />

      {/* Initials chip */}
      {initials && (
        <g>
          <rect x="5" y="13" width="6" height="3" fill="#0B0D11" opacity="0.0" />
          <text x="8" y="15.4" textAnchor="middle" fontSize="2.4" fill={WHITE} fontFamily="JetBrains Mono, monospace" fontWeight={700}>{initials}</text>
        </g>
      )}
    </svg>
  )
}

const armVariants: Variants = {
  rest:   { rotate: 0 },
  typing: { rotate: [0, -8, 4, -6, 0], transition: { duration: 0.45, repeat: Infinity, ease: 'easeInOut' } },
  wave:   { rotate: [0, -22, 0, -22, 0], transition: { duration: 1.2, repeat: Infinity, repeatDelay: 0.4 } },
  cross:  { rotate: 12, transition: { duration: 0.3 } },
}

type EyesKind = 'open' | 'focus' | 'closed' | 'sparkle' | 'sleep' | 'cross'

function eyesForStatus(status: AgentStatus): EyesKind {
  switch (status) {
    case 'Working':  return 'focus'
    case 'Waiting':  return 'open'
    case 'Result':
    case 'Complete': return 'sparkle'
    case 'Blocked':  return 'cross'
    case 'Locked':   return 'sleep'
    case 'Upgrade':  return 'sparkle'
    default:         return 'open'
  }
}

function Eyes({ kind }: { kind: EyesKind }) {
  if (kind === 'sparkle') {
    return (
      <g>
        <rect x="5" y="5" width="2" height="1" fill={OUTLINE} />
        <rect x="9" y="5" width="2" height="1" fill={OUTLINE} />
        <rect x="6" y="5" width="1" height="1" fill={WHITE} />
        <rect x="10" y="5" width="1" height="1" fill={WHITE} />
      </g>
    )
  }
  if (kind === 'focus') {
    return (
      <g>
        <rect x="5" y="5" width="2" height="1" fill={OUTLINE} />
        <rect x="9" y="5" width="2" height="1" fill={OUTLINE} />
      </g>
    )
  }
  if (kind === 'cross') {
    return (
      <g fill={OUTLINE}>
        <rect x="5" y="5" width="1" height="1" />
        <rect x="6" y="6" width="1" height="1" />
        <rect x="5" y="6" width="1" height="0.5" />
        <rect x="9" y="5" width="1" height="1" />
        <rect x="10" y="6" width="1" height="1" />
      </g>
    )
  }
  if (kind === 'sleep') {
    return (
      <g>
        <rect x="5" y="6" width="2" height="0.5" fill={OUTLINE} />
        <rect x="9" y="6" width="2" height="0.5" fill={OUTLINE} />
      </g>
    )
  }
  return (
    <motion.g
      animate={{ opacity: [1, 1, 1, 0.05, 1] }}
      transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.85, 0.92, 0.95, 1] }}
    >
      <rect x="5" y="5" width="2" height="2" fill={OUTLINE} />
      <rect x="9" y="5" width="2" height="2" fill={OUTLINE} />
      <rect x="6" y="5" width="1" height="1" fill={WHITE} />
      <rect x="10" y="5" width="1" height="1" fill={WHITE} />
    </motion.g>
  )
}

type MouthKind = 'neutral' | 'smile' | 'concentrate' | 'frown'

function mouthForStatus(status: AgentStatus): MouthKind {
  switch (status) {
    case 'Working':  return 'concentrate'
    case 'Result':
    case 'Complete': return 'smile'
    case 'Blocked':  return 'frown'
    case 'Locked':   return 'neutral'
    default:         return 'neutral'
  }
}

function Mouth({ kind }: { kind: MouthKind }) {
  if (kind === 'smile') {
    return (
      <g fill={OUTLINE}>
        <rect x="6" y="8" width="1" height="0.5" />
        <rect x="7" y="8.4" width="2" height="0.6" />
        <rect x="9" y="8" width="1" height="0.5" />
      </g>
    )
  }
  if (kind === 'concentrate') return <rect x="7" y="8" width="2" height="0.6" fill={OUTLINE} />
  if (kind === 'frown')       return <rect x="6.5" y="8.4" width="3" height="0.6" fill={OUTLINE} />
  return <rect x="7" y="8.2" width="2" height="0.4" fill={OUTLINE} />
}
