import { useEffect } from 'react'
import { useGame } from './store'
import { getMissionsForAgent, type MissionCatalogEntry, type MissionKey } from './missions'

export function ContextMenu() {
  const menu = useGame((s) => s.contextMenu)
  const agents = useGame((s) => s.agents)
  const close = useGame((s) => s.closeContextMenu)
  const selectAgent = useGame((s) => s.selectAgent)
  const completeMission = useGame((s) => s.completeMission)
  const unlockAgent = useGame((s) => s.unlockAgent)
  const openBriefChat = useGame((s) => s.openBriefChat)
  const enqueueMission = useGame((s) => s.enqueueMission)
  const openBriefingModal = useGame((s) => s.openBriefingModal)
  const hasDeliverables = useGame((s) => Object.keys(s.deliverables).length > 0)
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
  } else {
    const verb =
      agent.state === 'working' || agent.state === 'walking' ? 'Empiler' : 'Lancer'

    const launch = (entry: MissionCatalogEntry) => {
      if (entry.mode === 'live' && entry.missionKey) {
        if (hasDeliverables) {
          openBriefingModal({
            agentId: agent.id,
            mode: 'live',
            missionKey: entry.missionKey,
            title: entry.title,
          })
        } else {
          openBriefChat(entry.missionKey as MissionKey, null)
        }
      } else if (entry.mode === 'synthetic' && entry.templateId) {
        if (hasDeliverables) {
          openBriefingModal({
            agentId: agent.id,
            mode: 'enqueue',
            missionTemplateId: entry.templateId,
            title: entry.title,
          })
        } else {
          enqueueMission(agent.id, entry.templateId as never, null)
        }
      }
    }

    for (const entry of getMissionsForAgent(agent.id)) {
      items.push({
        label: `${verb} · ${entry.title}`,
        onClick: () => launch(entry),
        tone: entry.mode === 'live' ? 'success' : undefined,
        hint: entry.hint,
      })
    }
  }

  items.push({
    label: 'Ouvrir la fiche →',
    onClick: () => {
      selectAgent(agent.id)
      close()
    },
  })

  const left = Math.min(menu.screenX, window.innerWidth - 240)
  const top = Math.min(menu.screenY, window.innerHeight - 260)

  return (
    <div className="ctx-menu" style={{ left, top }} role="menu" aria-label={`Actions pour ${agent.name}`}>
      <header className="ctx-head">
        <span className="ctx-mark" style={{ background: agent.themeColor }} />
        <div>
          <strong>{agent.name}</strong>
          <span>{agent.className}</span>
          {agent.state !== 'locked' && (
            <span className="ctx-queue">
              {agent.taskQueue.length === 0
                ? 'File vide'
                : `${agent.taskQueue.length} tâche${agent.taskQueue.length > 1 ? 's' : ''} en attente`}
            </span>
          )}
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
