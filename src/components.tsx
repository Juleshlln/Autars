import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { MissionRarity } from './types'

/* ============================================================
   Button
   ============================================================ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  leadingIcon,
  trailingIcon,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`btn btn-${variant} btn-${size} ${fullWidth ? 'btn-full' : ''} ${className}`.trim()}
    >
      {leadingIcon ? <span className="btn-icon">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span className="btn-icon">{trailingIcon}</span> : null}
    </button>
  )
}

/* ============================================================
   Card
   ============================================================ */

export function Card({
  children,
  className = '',
  padding = 'md',
  as: Tag = 'div',
  interactive,
}: {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  as?: 'div' | 'article' | 'section'
  interactive?: boolean
}) {
  return (
    <Tag
      className={`card card-pad-${padding} ${interactive ? 'card-interactive' : ''} ${className}`.trim()}
    >
      {children}
    </Tag>
  )
}

/* ============================================================
   Badge
   ============================================================ */

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
}: {
  children: ReactNode
  tone?: BadgeTone
  size?: 'sm' | 'md'
}) {
  return <span className={`badge badge-${tone} badge-${size}`}>{children}</span>
}

export function RarityBadge({ rarity }: { rarity: MissionRarity }) {
  const label = rarity
  return <span className={`rarity rarity-${rarity.toLowerCase()}`}>{label}</span>
}

/* ============================================================
   Status dot
   ============================================================ */

type StatusTone = 'available' | 'locked' | 'completed' | 'progress'

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="status-dot" aria-hidden />
      {children}
    </span>
  )
}

/* ============================================================
   ProgressBar
   ============================================================ */

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  tone = 'accent',
  label,
  showValue,
}: {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  tone?: 'accent' | 'success' | 'warning'
  label?: string
  showValue?: boolean
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="progress-wrap">
      {(label || showValue) && (
        <div className="progress-meta">
          {label && <span>{label}</span>}
          {showValue && <span className="mono">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={`progress progress-${size}`}>
        <div className={`progress-fill progress-${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ============================================================
   Stepper (campagne)
   ============================================================ */

export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: { id: string; label: string; status: 'completed' | 'available' | 'locked' }[]
  current?: string
  onSelect?: (id: string) => void
}) {
  return (
    <ol className="stepper" aria-label="Progression du parcours">
      {steps.map((step, i) => {
        const isCurrent = step.id === current
        return (
          <li key={step.id} className={`step step-${step.status} ${isCurrent ? 'step-current' : ''}`}>
            <button
              type="button"
              className="step-dot"
              onClick={() => onSelect?.(step.id)}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>
            </button>
            <span className="step-label">{step.label}</span>
            {i < steps.length - 1 && <span className="step-line" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

/* ============================================================
   Stat
   ============================================================ */

export function Stat({
  label,
  value,
  hint,
  trend,
  size = 'md',
}: {
  label: string
  value: ReactNode
  hint?: string
  trend?: { tone: 'success' | 'danger' | 'neutral'; label: string }
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className={`stat stat-${size}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {(hint || trend) && (
        <div className="stat-foot">
          {trend && <span className={`stat-trend trend-${trend.tone}`}>{trend.label}</span>}
          {hint && <span className="stat-hint">{hint}</span>}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Field
   ============================================================ */

export function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  multiline,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  hint?: string
  multiline?: boolean
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? (
        <textarea
          className="field-input"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <input
          className="field-input"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
        />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className="field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ============================================================
   EmptyState
   ============================================================ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

/* ============================================================
   Section header
   ============================================================ */

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-desc">{description}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </header>
  )
}

/* ============================================================
   Modal
   ============================================================ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}

/* ============================================================
   Toast
   ============================================================ */

type ToastTone = 'success' | 'info' | 'warning' | 'danger'

export function Toast({
  open,
  tone = 'success',
  message,
  onClose,
  duration = 3200,
}: {
  open: boolean
  tone?: ToastTone
  message: string
  onClose: () => void
  duration?: number
}) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(t)
  }, [open, duration, onClose])

  if (!open) return null
  return (
    <div className={`toast toast-${tone}`} role="status">
      <span className="toast-dot" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

/* ============================================================
   Skeleton
   ============================================================ */

export function Skeleton({
  width = '100%',
  height = 12,
  radius = 'var(--radius-sm)',
}: {
  width?: number | string
  height?: number | string
  radius?: string
}) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} />
}

/* ============================================================
   TabBar
   ============================================================ */

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          className={`tab ${value === tab.id ? 'tab-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {typeof tab.count === 'number' && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
