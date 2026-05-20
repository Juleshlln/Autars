import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useGame } from './store'

interface Industry {
  id: string
  name: string
  description: string
  icon: string
  themeColor: string
}

const INDUSTRIES: Industry[] = [
  {
    id: 'saas-b2b',
    name: 'SaaS B2B',
    description: 'Logiciel récurrent vendu aux entreprises. Cycles longs, marges élevées.',
    icon: '◆',
    themeColor: '#7B7BEC',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    description: 'Produit physique ou DTC. Acquisition payante, marge volume.',
    icon: '◈',
    themeColor: '#34D399',
  },
  {
    id: 'creator',
    name: 'Création de contenu',
    description: 'Newsletter, podcast, vidéo. Audience-first, monétisation diverse.',
    icon: '◉',
    themeColor: '#22D3EE',
  },
  {
    id: 'agency',
    name: 'Agence / Service',
    description: 'Prestation expert à forte valeur ajoutée. Cash-flow rapide.',
    icon: '◇',
    themeColor: '#F97316',
  },
]

interface StarterAgent {
  id: string
  name: string
  className: string
  description: string
  themeColor: string
}

const STARTER_AGENTS: StarterAgent[] = [
  {
    id: 'strategist',
    name: 'Stratège',
    className: 'Architecte de la vision',
    description: 'Cartographie le marché et structure la promesse centrale du projet.',
    themeColor: '#FFCF3A',
  },
  {
    id: 'analyst',
    name: 'Analyste Marché',
    description: 'Croise données marché et signaux pour valider les hypothèses chiffrées.',
    className: 'Œil quantitatif',
    themeColor: '#22D3EE',
  },
]

type Step = 0 | 1 | 2

interface Props {
  onComplete: (ventureId: string) => void
}

export function NewVentureModal({ onComplete }: Props) {
  const open = useGame((s) => s.showNewVentureModal)
  const close = useGame((s) => s.closeNewVentureModal)
  const createVenture = useGame((s) => s.createVenture)

  const [step, setStep] = useState<Step>(0)
  const [industryId, setIndustryId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [starterAgentId, setStarterAgentId] = useState<string | null>(null)

  function reset() {
    setStep(0)
    setIndustryId(null)
    setName('')
    setSubtitle('')
    setStarterAgentId(null)
  }

  function handleClose() {
    close()
    setTimeout(reset, 300)
  }

  function handleNext() {
    if (step === 0 && industryId) setStep(1)
    else if (step === 1 && name.trim() && subtitle.trim()) setStep(2)
    else if (step === 2 && starterAgentId) {
      const industry = INDUSTRIES.find((i) => i.id === industryId)
      const id = createVenture({
        industry: industry?.name ?? 'Autre',
        name: name.trim(),
        subtitle: subtitle.trim(),
        starterAgentId,
      })
      reset()
      onComplete(id)
    }
  }

  function handleBack() {
    if (step > 0) setStep((s) => (s - 1) as Step)
  }

  const canAdvance =
    (step === 0 && !!industryId) ||
    (step === 1 && name.trim().length > 1 && subtitle.trim().length > 2) ||
    (step === 2 && !!starterAgentId)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nv-overlay"
          className="nv-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          aria-modal
          role="dialog"
          aria-label="Création d'une nouvelle filiale"
        >
          <motion.div
            className="nv-modal"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="nv-close"
              aria-label="Fermer"
              onClick={handleClose}
            >
              ×
            </button>

            <header className="nv-head">
              <span className="nv-eyebrow">Nouvelle filiale</span>
              <h2>{stepTitle(step)}</h2>
              <p className="nv-sub">{stepSub(step)}</p>
              <div className="nv-steps" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`nv-step-dot ${i === step ? 'is-active' : ''} ${
                      i < step ? 'is-done' : ''
                    }`}
                  />
                ))}
              </div>
            </header>

            <div className="nv-body">
              <motion.div
                key={`step-${step}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22 }}
              >
                  {step === 0 && (
                    <div className="nv-grid">
                      {INDUSTRIES.map((ind) => (
                        <button
                          key={ind.id}
                          type="button"
                          className={`nv-card ${industryId === ind.id ? 'is-selected' : ''}`}
                          onClick={() => setIndustryId(ind.id)}
                          style={{
                            ['--nv-card-color' as string]: ind.themeColor,
                          }}
                        >
                          <span className="nv-card-icon" style={{ color: ind.themeColor }}>
                            {ind.icon}
                          </span>
                          <strong>{ind.name}</strong>
                          <p>{ind.description}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {step === 1 && (
                    <div className="nv-form">
                      <label className="nv-field">
                        <span>Nom de la filiale</span>
                        <input
                          type="text"
                          autoFocus
                          value={name}
                          maxLength={42}
                          placeholder="ex: Lumen.audit"
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>

                      <label className="nv-field">
                        <span>Sous-titre / Promesse</span>
                        <textarea
                          rows={2}
                          value={subtitle}
                          maxLength={140}
                          placeholder="ex: Auditez votre stack AI en moins de 48h"
                          onChange={(e) => setSubtitle(e.target.value)}
                        />
                        <em className="nv-counter">{subtitle.length}/140</em>
                      </label>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="nv-grid nv-grid-agents">
                      {STARTER_AGENTS.map((ag) => (
                        <button
                          key={ag.id}
                          type="button"
                          className={`nv-card nv-card-agent ${
                            starterAgentId === ag.id ? 'is-selected' : ''
                          }`}
                          onClick={() => setStarterAgentId(ag.id)}
                          style={{ ['--nv-card-color' as string]: ag.themeColor }}
                        >
                          <span
                            className="nv-agent-portrait"
                            style={{
                              background: `linear-gradient(135deg, ${ag.themeColor}, #1c1c28)`,
                            }}
                          >
                            {ag.name[0]}
                          </span>
                          <div>
                            <strong>{ag.name}</strong>
                            <p className="nv-agent-class">{ag.className}</p>
                            <p>{ag.description}</p>
                            <span className="nv-agent-tag">Gratuit</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
              </motion.div>
            </div>

            <footer className="nv-foot">
              <button
                type="button"
                className="nv-ghost"
                onClick={step === 0 ? handleClose : handleBack}
              >
                {step === 0 ? 'Annuler' : '← Retour'}
              </button>
              <button
                type="button"
                className="nv-cta"
                disabled={!canAdvance}
                onClick={handleNext}
              >
                {step === 2 ? 'Lancer la filiale →' : 'Continuer →'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function stepTitle(step: Step) {
  switch (step) {
    case 0:
      return 'Choisissez votre secteur'
    case 1:
      return "L'identité de la filiale"
    case 2:
      return 'Votre premier agent'
  }
}

function stepSub(step: Step) {
  switch (step) {
    case 0:
      return "Le secteur définit l'écosystème, les concurrents et la stack d'agents recommandée."
    case 1:
      return 'Un nom percutant et une promesse claire. Vous pourrez ajuster plus tard.'
    case 2:
      return 'Recrutez votre premier collaborateur IA. Les autres se débloqueront avec vos premiers revenus.'
  }
}
