import { useEffect } from 'react'
import { useGame, MISSION_TEMPLATES } from './store'

export function ContextMenu() {
  const menu = useGame((s) => s.contextMenu)
  const agents = useGame((s) => s.agents)
  const close = useGame((s) => s.closeContextMenu)
  const startMission = useGame((s) => s.startMission)
  const selectAgent = useGame((s) => s.selectAgent)
  const completeMission = useGame((s) => s.completeMission)
  const unlockAgent = useGame((s) => s.unlockAgent)
  const credits = useGame((s) => s.credits)

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.ctx-menu')) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [menu, close])

  if (!menu) return null
  const agent = agents[menu.agentId]
  if (!agent) return null

  const items: Array<{
    label: string
    onClick: () => void
    disabled?: boolean
    tone?: 'primary' | 'success' | 'warning'
    hint?: string
  }> = []

  if (agent.state === 'locked') {
    items.push({
      label: `Recruter — ${agent.unlockCost ?? 0} crédits`,
      onClick: () => unlockAgent(agent.id),
      disabled: credits < (agent.unlockCost ?? 0),
      tone: 'success',
      hint: `Crédit dispo · ${credits}`,
    })
  } else if (agent.state === 'delivered') {
    items.push({
      label: 'Valider le livrable',
      onClick: () => completeMission(agent.id),
      tone: 'success',
      hint: 'Crédits + XP',
    })
  } else if (agent.state === 'working' || agent.state === 'walking') {
    items.push({
      label: 'Mission en cours…',
      onClick: () => {},
      disabled: true,
      hint: `${Math.round(agent.progress * 100)}%`,
    })
  } else {
    if (agent.id === 'analyst') {
      items.push({
        label: "Lancer · Scan d'opportunité",
        onClick: () => startMission(agent.id, 'scan'),
        tone: 'primary',
        hint: `-${MISSION_TEMPLATES.scan.energyCost} ⚡ · +${MISSION_TEMPLATES.scan.reward}c`,
      })
    }
    if (agent.id === 'strategist') {
      items.push({
        label: 'Lancer · Positionnement',
        onClick: () => startMission(agent.id, 'positioning'),
        tone: 'primary',
        hint: `-${MISSION_TEMPLATES.positioning.energyCost} ⚡ · +${MISSION_TEMPLATES.positioning.reward}c`,
      })
    }
    if (agent.id === 'brandBuilder') {
      items.push({
        label: 'Lancer · Kit de marque',
        onClick: () => startMission(agent.id, 'branding'),
        tone: 'primary',
        hint: `-${MISSION_TEMPLATES.branding.energyCost} ⚡ · +${MISSION_TEMPLATES.branding.reward}c`,
      })
    }
    items.push({
      label: 'Lancer · Mission Marketing',
      onClick: () => startMission(agent.id, 'marketing'),
      tone: 'primary',
      hint: `-${MISSION_TEMPLATES.marketing.energyCost} ⚡ · +${MISSION_TEMPLATES.marketing.reward}c`,
    })
  }

  items.push({
    label: 'Ouvrir la fiche →',
    onClick: () => {
      selectAgent(agent.id)
      close()
    },
  })

  // Clamp so it doesn't escape the viewport
  const left = Math.min(menu.screenX, window.innerWidth - 240)
  const top = Math.min(menu.screenY, window.innerHeight - 260)

  return (
    <div className="ctx-menu" style={{ left, top }} role="menu" aria-label={`Actions pour ${agent.name}`}>
      <header className="ctx-head">
        <span className="ctx-mark" style={{ background: agent.themeColor }} />
        <div>
          <strong>{agent.name}</strong>
          <span>{agent.className}</span>
        </div>
      </header>
      <ul className="ctx-list">
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              className={`ctx-item ${it.tone ? `ctx-${it.tone}` : ''}`}
              disabled={it.disabled}
              onClick={() => {
                it.onClick()
                if (!it.disabled) close()
              }}
            >
              <span>{it.label}</span>
              {it.hint && <em>{it.hint}</em>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
