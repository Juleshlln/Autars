// =====================================================================
// DeliverableViewModal — renders a structured deliverable + HITL actions.
// Lives in src/v1 because it talks to v1's backend state, not the Pixi game.
// =====================================================================

import { useMemo, useState, type ReactElement } from 'react'
import { ArrowRight, Check, Loader2, RefreshCcw, X } from 'lucide-react'
import type { DeliverableRow } from '../services/deliverablesService'

interface RecommendedNextMission {
  title: string
  description: string
  agent_role: string
  mission_type?: string
  priority?: 'high' | 'medium' | 'low'
}

interface StructuredContent {
  title?: string
  summary?: string
  business_idea?: string
  target_customer?: string
  problem?: string
  value_proposition?: string
  key_assumptions?: unknown
  risks?: unknown
  recommended_next_missions?: RecommendedNextMission[]
  markdown?: string
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function renderMarkdownLite(markdown: string) {
  // Tiny renderer: turns headings + paragraphs + bullets into HTML. We avoid
  // pulling a markdown library since the LLM output is constrained.
  const lines = markdown.split('\n')
  const blocks: ReactElement[] = []
  let buffer: string[] = []
  let listBuffer: string[] = []

  const flushParagraph = () => {
    if (buffer.length === 0) return
    blocks.push(
      <p key={`p-${blocks.length}`} className="deliverable-paragraph">
        {buffer.join(' ')}
      </p>,
    )
    buffer = []
  }
  const flushList = () => {
    if (listBuffer.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="deliverable-list">
        {listBuffer.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>,
    )
    listBuffer = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }
    if (line.startsWith('# ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <h2 key={`h-${blocks.length}`} className="deliverable-h1">
          {line.slice(2)}
        </h2>,
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="deliverable-h2">
          {line.slice(3)}
        </h3>,
      )
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph()
      listBuffer.push(line.slice(2))
      continue
    }
    flushList()
    buffer.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}

export function DeliverableViewModal({
  deliverable,
  missionTitle,
  agentName,
  onClose,
  onValidate,
  onReject,
  onIterate,
  onConvertRecommendation,
}: {
  deliverable: DeliverableRow
  missionTitle: string
  agentName: string
  onClose: () => void
  onValidate: () => Promise<void>
  onReject: (feedback?: string) => Promise<void>
  onIterate: (feedback: string) => Promise<void>
  onConvertRecommendation: (index: number) => Promise<void>
}) {
  const content = deliverable.structuredContent as StructuredContent
  const recommendations = useMemo(
    () =>
      Array.isArray(content.recommended_next_missions)
        ? content.recommended_next_missions
        : [],
    [content.recommended_next_missions],
  )
  const keyAssumptions = asStringArray(content.key_assumptions)
  const risks = asStringArray(content.risks)
  const isMarkdown = deliverable.type === 'markdown' && typeof content.markdown === 'string'

  const [busy, setBusy] = useState<'validate' | 'iterate' | 'reject' | 'convert' | null>(
    null,
  )
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null)
  const [iterating, setIterating] = useState(false)
  const [feedback, setFeedback] = useState('')

  const wrap = async (kind: 'validate' | 'iterate' | 'reject', fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const decisionLocked =
    deliverable.status !== 'pending_validation' && deliverable.status !== 'needs_improvement'

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="mission-modal deliverable-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Livrable"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="panel-kicker">Livrable agent</span>
            <h2>{content.title || deliverable.title || missionTitle}</h2>
            <p className="deliverable-meta">
              {agentName} · Version {deliverable.version} · Statut :{' '}
              <strong>{deliverable.status}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="deliverable-body">
          {content.summary ? (
            <section className="deliverable-section">
              <h3>Résumé</h3>
              <p>{content.summary}</p>
            </section>
          ) : null}

          {isMarkdown && content.markdown ? (
            <section className="deliverable-section deliverable-markdown">
              {renderMarkdownLite(content.markdown)}
            </section>
          ) : (
            <>
              {content.business_idea ? (
                <section className="deliverable-section">
                  <h3>Idée business reformulée</h3>
                  <p>{content.business_idea}</p>
                </section>
              ) : null}
              {content.target_customer ? (
                <section className="deliverable-section">
                  <h3>Client cible</h3>
                  <p>{content.target_customer}</p>
                </section>
              ) : null}
              {content.problem ? (
                <section className="deliverable-section">
                  <h3>Problème</h3>
                  <p>{content.problem}</p>
                </section>
              ) : null}
              {content.value_proposition ? (
                <section className="deliverable-section">
                  <h3>Proposition de valeur</h3>
                  <p>{content.value_proposition}</p>
                </section>
              ) : null}
              {keyAssumptions.length > 0 ? (
                <section className="deliverable-section">
                  <h3>Hypothèses clés</h3>
                  <ul className="deliverable-list">
                    {keyAssumptions.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {risks.length > 0 ? (
                <section className="deliverable-section">
                  <h3>Risques</h3>
                  <ul className="deliverable-list">
                    {risks.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}

          {recommendations.length > 0 ? (
            <section className="deliverable-section">
              <h3>Missions suivantes recommandées</h3>
              <ul className="deliverable-recommendation-list">
                {recommendations.map((reco, idx) => (
                  <li key={idx} className="deliverable-recommendation">
                    <div>
                      <strong>{reco.title}</strong>
                      <span className="reco-tags">
                        <em>{reco.agent_role}</em>
                        {reco.priority ? <em className={`reco-priority reco-${reco.priority}`}>{reco.priority}</em> : null}
                      </span>
                      <p>{reco.description}</p>
                    </div>
                    <button
                      type="button"
                      className="mission-action-btn mission-action-launch"
                      disabled={busy !== null || convertingIndex !== null}
                      onClick={async () => {
                        setConvertingIndex(idx)
                        setBusy('convert')
                        try {
                          await onConvertRecommendation(idx)
                        } finally {
                          setBusy(null)
                          setConvertingIndex(null)
                        }
                      }}
                    >
                      {convertingIndex === idx ? (
                        <Loader2 size={13} className="spin" />
                      ) : (
                        <ArrowRight size={13} />
                      )}
                      Transformer en mission
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {decisionLocked ? (
          <footer className="deliverable-footer deliverable-footer-locked">
            <span>
              Décision déjà prise ({deliverable.status}). Une nouvelle version sera créée
              si l'agent itère.
            </span>
            <button type="button" className="secondary-cta" onClick={onClose}>
              Fermer
            </button>
          </footer>
        ) : (
          <footer className="deliverable-footer">
            {iterating ? (
              <div className="deliverable-iterate-row">
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Que faut-il améliorer ? (sera transmis à l'agent)"
                  rows={3}
                />
                <div className="deliverable-iterate-actions">
                  <button
                    type="button"
                    className="secondary-cta"
                    onClick={() => {
                      setIterating(false)
                      setFeedback('')
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="primary-cta"
                    disabled={busy !== null || feedback.trim().length < 4}
                    onClick={() =>
                      wrap('iterate', async () => {
                        await onIterate(feedback.trim())
                        setIterating(false)
                        setFeedback('')
                        onClose()
                      })
                    }
                  >
                    {busy === 'iterate' ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <RefreshCcw size={16} />
                    )}
                    Demander une amélioration
                  </button>
                </div>
              </div>
            ) : (
              <div className="deliverable-actions">
                <button
                  type="button"
                  className="secondary-cta"
                  disabled={busy !== null}
                  onClick={() =>
                    wrap('reject', async () => {
                      await onReject()
                      onClose()
                    })
                  }
                >
                  {busy === 'reject' ? <Loader2 size={16} className="spin" /> : <X size={16} />}
                  Rejeter
                </button>
                <button
                  type="button"
                  className="secondary-cta"
                  disabled={busy !== null}
                  onClick={() => setIterating(true)}
                >
                  <RefreshCcw size={16} />
                  Améliorer
                </button>
                <button
                  type="button"
                  className="primary-cta"
                  disabled={busy !== null}
                  onClick={() =>
                    wrap('validate', async () => {
                      await onValidate()
                      onClose()
                    })
                  }
                >
                  {busy === 'validate' ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                  Valider
                </button>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
