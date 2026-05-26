// =====================================================================
// Mission simulation
// =====================================================================
// MVP-only: produces a typed result and triggers completeMission() after
// a short delay. Designed to be replaced by an Edge Function worker that
// calls a real LLM. Keep this file pure (no React, no store) so we can
// move it server-side without changes.
// =====================================================================

import type { MissionResult } from '../lib/types'
import { completeMission } from './missionsService'
import { awardMissionXp } from './xpService'

const RESULT_TEMPLATES: Record<string, MissionResult> = {
  clarify: {
    summary:
      'Votre idée doit être formulée comme une promesse claire : aider [cible] à obtenir [résultat] grâce à [mécanisme].',
    next_steps: [
      'Décrire le problème client en une phrase',
      'Identifier le client le plus douloureux',
      'Formuler une promesse mesurable',
    ],
  },
  segment: {
    summary:
      "Le bon client cible est celui qui a un problème fréquent, coûteux et urgent.",
    next_steps: [
      'Lister 3 segments possibles',
      'Noter leur urgence de problème sur 10',
      'Choisir un segment prioritaire',
    ],
  },
  'value-prop': {
    summary:
      'La proposition de valeur doit expliquer pourquoi votre solution est plus simple, plus rapide ou plus rentable que les alternatives.',
    next_steps: [
      'Lister les alternatives existantes',
      'Identifier l’avantage principal',
      'Écrire une phrase de proposition de valeur',
    ],
  },
  offer: {
    summary:
      'Une bonne première offre doit être simple à comprendre, rapide à livrer et suffisamment chère pour tester la volonté de payer.',
    next_steps: [
      'Définir un livrable concret',
      'Choisir un prix test',
      'Préparer une offre en une phrase',
    ],
  },
  landing: {
    summary: 'La landing page doit vendre une promesse, pas seulement présenter une idée.',
    next_steps: [
      'Écrire un titre orienté résultat',
      'Ajouter une preuve ou un bénéfice clair',
      'Créer un call-to-action simple',
    ],
  },
  acquisition: {
    summary:
      'Le premier canal d’acquisition doit être choisi selon la proximité avec le client, pas selon la tendance du moment.',
    next_steps: [
      'Identifier où se trouve déjà la cible',
      'Choisir un canal prioritaire',
      'Créer une action simple à tester cette semaine',
    ],
  },
}

const FALLBACK: MissionResult = {
  summary:
    "Première analyse générée par l'agent. À utiliser comme point de départ, à ajuster selon le contexte du projet.",
  next_steps: [
    "Valider l'hypothèse principale",
    'Choisir un segment cible',
    'Créer une première offre testable',
  ],
}

export function buildResultFor(missionType: string | null | undefined): MissionResult {
  const template = (missionType && RESULT_TEMPLATES[missionType]) || FALLBACK
  return { ...template, simulated: true }
}

export interface SimulationContext {
  missionId: string
  workspaceId: string
  ownerId: string
  agentId: string | null
  title: string
  type: string | null
  xpReward?: number
}

export interface SimulationOutcome {
  mission: Awaited<ReturnType<typeof completeMission>>
  xp: Awaited<ReturnType<typeof awardMissionXp>> | null
}

/**
 * Performs the completion immediately (no timer). Use this from a worker.
 */
export async function runSimulation(ctx: SimulationContext): Promise<SimulationOutcome> {
  const result = buildResultFor(ctx.type)
  const mission = await completeMission({
    missionId: ctx.missionId,
    workspaceId: ctx.workspaceId,
    ownerId: ctx.ownerId,
    agentId: ctx.agentId,
    title: ctx.title,
    result,
  })

  let xp = null
  if (ctx.agentId) {
    xp = await awardMissionXp({
      agentId: ctx.agentId,
      xp: ctx.xpReward ?? 20,
    })
  }

  return { mission, xp }
}

/**
 * Schedules `runSimulation` after a short client-side delay. This is a
 * temporary MVP stand-in for an Edge Function worker; the caller receives a
 * disposer to cancel the scheduled run (e.g. on unmount).
 *
 * @returns a `cancel` function
 */
export function scheduleSimulation(
  ctx: SimulationContext,
  onDone: (outcome: SimulationOutcome) => void,
  onError?: (err: unknown) => void,
  delayMs = 7000,
): () => void {
  const timer = window.setTimeout(() => {
    runSimulation(ctx)
      .then(onDone)
      .catch((err) => {
        if (onError) onError(err)
      })
  }, delayMs)
  return () => window.clearTimeout(timer)
}
