import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { levelLabel } from '../state'

interface LevelUpModalProps {
  open: boolean
  level: number
  perks: string[]
  onClose: () => void
}

/**
 * Modal "Niveau supérieur" déclenchée quand le niveau founder augmente.
 * - Confetti canvas burst en deux salves
 * - Carte centrale animée (spring scale-in)
 * - Liste des nouvelles capacités débloquées
 */
export function LevelUpModal({ open, level, perks, onClose }: LevelUpModalProps) {
  useEffect(() => {
    if (!open) return
    fireConfetti()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="levelup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="levelup-card"
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="levelup-glow" aria-hidden />
            <span className="levelup-eyebrow">Niveau supérieur</span>
            <div className="levelup-number">
              <span className="mono">{level}</span>
              <small>NIV.</small>
            </div>
            <h2 className="levelup-title">{levelLabel(level)}</h2>
            <p className="levelup-sub">Votre entreprise IA franchit un palier.</p>

            <ul className="levelup-perks">
              {perks.map((p) => (
                <motion.li
                  key={p}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + perks.indexOf(p) * 0.08 }}
                >
                  <span aria-hidden>✦</span>
                  {p}
                </motion.li>
              ))}
            </ul>

            <button type="button" className="levelup-cta" onClick={onClose}>
              Continuer
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function fireConfetti() {
  const colors = ['#8A8AFF', '#22D3EE', '#34D399', '#FBBF24', '#C084FC']
  const end = Date.now() + 1200

  ;(function frame() {
    confetti({ particleCount: 4, angle: 60,  spread: 60, origin: { x: 0, y: 0.7 }, colors })
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()

  setTimeout(() => {
    confetti({ particleCount: 80, spread: 90, origin: { y: 0.55 }, colors, startVelocity: 36 })
  }, 200)
}
