import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame } from './store'

type ViewMode = 'markdown' | 'json'

export function DeliverableModal() {
  const openId = useGame((s) => s.openDeliverableId)
  const deliverable = useGame(useShallow((s) => (s.openDeliverableId ? s.deliverables[s.openDeliverableId] : null)))
  const close = useGame((s) => s.openDeliverable)
  const [view, setView] = useState<ViewMode>('markdown')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!openId) {
      setCopied(false)
      setView('markdown')
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, close])

  const html = useMemo(
    () => (deliverable ? markdownToHtml(deliverable.markdown) : ''),
    [deliverable],
  )

  function handleCopy() {
    if (!deliverable) return
    const content = view === 'markdown' ? deliverable.markdown : JSON.stringify(deliverable.json, null, 2)
    void navigator.clipboard?.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  function handleDownload(kind: 'md' | 'json') {
    if (!deliverable) return
    const filename = `${deliverable.agentId}-${slugify(deliverable.missionTitle)}.${kind}`
    const content =
      kind === 'md' ? deliverable.markdown : JSON.stringify(deliverable.json, null, 2)
    const blob = new Blob([content], { type: kind === 'md' ? 'text/markdown' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <AnimatePresence>
      {openId && deliverable && (
        <>
          <motion.div
            key="deliv-backdrop"
            className="deliv-backdrop"
            onClick={() => close(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            key="deliv-modal"
            className="deliv-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Livrable — ${deliverable.missionTitle}`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <header className="deliv-head">
              <div>
                <p className="hud-eyebrow">Livrable</p>
                <h2>{deliverable.missionTitle}</h2>
                <p className="deliv-meta">
                  Généré par {deliverable.agentName} ·{' '}
                  {new Date(deliverable.generatedAt).toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="deliv-actions">
                <div className="deliv-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'markdown'}
                    className={view === 'markdown' ? 'is-active' : ''}
                    onClick={() => setView('markdown')}
                  >
                    Rapport
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'json'}
                    className={view === 'json' ? 'is-active' : ''}
                    onClick={() => setView('json')}
                  >
                    JSON
                  </button>
                </div>
                <button type="button" className="deliv-close" onClick={() => close(null)} aria-label="Fermer">
                  ✕
                </button>
              </div>
            </header>

            <div className="deliv-body">
              {view === 'markdown' ? (
                <article
                  className="deliv-md"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <pre className="deliv-json">{JSON.stringify(deliverable.json, null, 2)}</pre>
              )}
            </div>

            <footer className="deliv-foot">
              <button type="button" className="deliv-ghost" onClick={handleCopy}>
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
              <button
                type="button"
                className="deliv-ghost"
                onClick={() => handleDownload(view === 'markdown' ? 'md' : 'json')}
              >
                Télécharger .{view === 'markdown' ? 'md' : 'json'}
              </button>
              <button type="button" className="deliv-primary" onClick={() => close(null)}>
                Archiver le livrable
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ============================================================
   Lightweight Markdown → HTML converter
   - covers what our deliverable templates emit (headings, lists, tables,
     bold, inline-code, blockquotes) and ignores anything more exotic
   ============================================================ */

function markdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  let inOrdered = false
  let inTable = false

  const closeAll = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
    if (inOrdered) {
      out.push('</ol>')
      inOrdered = false
    }
    if (inTable) {
      out.push('</tbody></table>')
      inTable = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const line = raw.trimEnd()

    // Table detection: header row followed by --- row
    if (line.startsWith('|') && lines[i + 1]?.match(/^\s*\|?\s*-{2,}.*\|/)) {
      closeAll()
      const headers = parseRow(line)
      out.push('<table><thead><tr>')
      headers.forEach((h) => out.push(`<th>${inline(escape(h))}</th>`))
      out.push('</tr></thead><tbody>')
      inTable = true
      i++ // skip the separator row
      continue
    }
    if (inTable && line.startsWith('|')) {
      const cells = parseRow(line)
      out.push('<tr>')
      cells.forEach((c) => out.push(`<td>${inline(escape(c))}</td>`))
      out.push('</tr>')
      continue
    }
    if (inTable && !line.startsWith('|')) {
      out.push('</tbody></table>')
      inTable = false
    }

    if (line.startsWith('# ')) {
      closeAll()
      out.push(`<h1>${inline(escape(line.slice(2)))}</h1>`)
    } else if (line.startsWith('## ')) {
      closeAll()
      out.push(`<h2>${inline(escape(line.slice(3)))}</h2>`)
    } else if (line.startsWith('### ')) {
      closeAll()
      out.push(`<h3>${inline(escape(line.slice(4)))}</h3>`)
    } else if (line.startsWith('> ')) {
      closeAll()
      out.push(`<blockquote>${inline(escape(line.slice(2)))}</blockquote>`)
    } else if (line.match(/^\d+\.\s/)) {
      if (!inOrdered) {
        closeAll()
        out.push('<ol>')
        inOrdered = true
      }
      out.push(`<li>${inline(escape(line.replace(/^\d+\.\s/, '')))}</li>`)
    } else if (line.startsWith('- ')) {
      if (!inList) {
        closeAll()
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(escape(line.slice(2)))}</li>`)
    } else if (line.startsWith('_') && line.endsWith('_') && line.length > 2) {
      closeAll()
      out.push(`<p class="deliv-md-em">${inline(escape(line.slice(1, -1)))}</p>`)
    } else if (line.trim() === '') {
      closeAll()
    } else {
      closeAll()
      out.push(`<p>${inline(escape(line))}</p>`)
    }
  }
  closeAll()
  return out.join('\n')
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

function parseRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
