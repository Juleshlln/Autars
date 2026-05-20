import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame } from './store'
import './hub.css'

export function BriefChatModal() {
  const chat = useGame(useShallow((s) => s.briefChat))
  const agent = useGame(useShallow((s) => (s.briefChat ? s.agents[s.briefChat.agentId] : null)))
  const ventureName = useGame((s) => s.ventureName)
  const closeBriefChat = useGame((s) => s.closeBriefChat)
  const sendBriefUserMessage = useGame((s) => s.sendBriefUserMessage)
  const runRealMission = useGame((s) => s.runRealMission)

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageCount = chat?.messages.length
  const latestMessageContent = chat?.messages.at(-1)?.content

  useEffect(() => {
    if (!chat) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBriefChat()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chat, closeBriefChat])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messageCount, latestMessageContent])

  if (!chat || !agent) {
    return null
  }

  const busy = chat.status === 'streaming' || chat.status === 'running'
  const ready = chat.status === 'ready'
  const error = chat.status === 'error'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || busy) return
    void sendBriefUserMessage(draft)
    setDraft('')
  }

  return (
    <AnimatePresence>
      {chat && (
        <motion.div
          key="brief-backdrop"
          className="brief-backdrop"
          onClick={closeBriefChat}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            key="brief-modal"
            className="brief-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Brief avec ${agent.name}`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <header className="brief-head">
              <div
                className="brief-portrait"
                style={{ background: agent.themeColor }}
              >
                <span>{agent.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="brief-titles">
                <p className="hud-eyebrow">Brief live · {ventureName}</p>
                <h2>{agent.name}</h2>
                <p className="brief-sub">
                  4 questions pour cadrer le scan d'opportunité.
                </p>
              </div>
              <button
                type="button"
                className="brief-close"
                onClick={closeBriefChat}
                aria-label="Fermer"
              >
                ✕
              </button>
            </header>

            <div className="brief-body" ref={scrollRef}>
              {chat.messages.length === 0 && chat.status !== 'streaming' && (
                <p className="brief-empty">
                  Connexion au Stratège…
                </p>
              )}
              {chat.messages.map((m, i) => (
                <div key={i} className={`brief-msg brief-msg-${m.role}`}>
                  <span className="brief-msg-role">
                    {m.role === 'user' ? 'Vous' : agent.name}
                  </span>
                  <div className="brief-msg-content">
                    {renderContent(m.content)}
                    {chat.status === 'streaming' &&
                      m.role === 'assistant' &&
                      i === chat.messages.length - 1 && (
                        <span className="brief-cursor">▍</span>
                      )}
                  </div>
                </div>
              ))}
              {error && (
                <div className="brief-error">
                  Erreur : {chat.error ?? 'inconnue'}
                </div>
              )}
            </div>

            <footer className="brief-foot">
              {ready ? (
                <button
                  type="button"
                  className="brief-cta"
                  onClick={() => void runRealMission()}
                >
                  Lancer la mission réelle →
                </button>
              ) : (
                <form className="brief-form" onSubmit={handleSubmit}>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      busy
                        ? 'Le Stratège réfléchit…'
                        : 'Réponse au Stratège…'
                    }
                    disabled={busy}
                    autoFocus
                  />
                  <button type="submit" disabled={busy || !draft.trim()}>
                    Envoyer
                  </button>
                </form>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function renderContent(text: string) {
  const cleaned = text.replace(/BRIEF_READY/g, '✓ Brief prêt')
  return <span>{cleaned}</span>
}
