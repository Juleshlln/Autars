import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame } from './store'

const MAX_VISIBLE = 18

export function ActivityConsole() {
  const logs = useGame(useShallow((s) => s.logs.slice(0, MAX_VISIBLE)))
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Latest log at the top, so we keep the scroll glued to the top.
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [logs])

  return (
    <section className="activity-console" aria-label="Console d'activité des agents">
      <header className="activity-console-head">
        <div className="activity-console-title">Console d'activité</div>
        <span className="activity-console-count">{logs.length} évènements</span>
      </header>
      <div ref={bodyRef} className="activity-console-body">
        {logs.length === 0 && (
          <div className="activity-log-empty">Aucun agent actif pour le moment.</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="activity-log">
            <time>{formatTime(log.ts)}</time>
            <span className="activity-log-agent">[{log.agentName}]</span>
            <span className="activity-log-msg">{log.message}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}
