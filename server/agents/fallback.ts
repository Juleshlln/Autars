// =====================================================================
// Mission fallback generator + result validator
// =====================================================================
// When the LLM returns an empty completion, a malformed JSON, or any
// other technical failure that does NOT warrant a hard refund, we still
// produce a usable deliverable so the founder can keep moving. Every
// fallback is clearly labelled as such (title prefix + metadata flag)
// so the UI can show a banner.
// =====================================================================

import type { AgentMissionDefinition, AgentRunContext } from './types'
import type { AgentExecutionResult } from './runAgentMission'

// ---------------------------------------------------------------------
// validateMissionResult
// ---------------------------------------------------------------------
// Boundary guard used right after the orchestrator returns. Catches the
// "ok but empty" case: legacy code paths could return an AgentExecutionResult
// with `ok:true` but an empty `content`/`summary`. We refuse those.
// ---------------------------------------------------------------------
export interface ValidatedResult {
  ok: true
  normalizedContent: string
  normalizedSummary: string
}

export interface InvalidResult {
  ok: false
  errorCode:
    | 'invalid_empty_result'
    | 'invalid_too_short'
    | 'invalid_not_object'
    | 'invalid_no_summary'
  errorMessage: string
}

const MIN_MARKDOWN_CHARS = 80
const MIN_JSON_KEYS = 3

export function validateMissionResult(
  result: AgentExecutionResult,
): ValidatedResult | InvalidResult {
  const content =
    typeof result.content === 'string' ? result.content.trim() : ''
  const summary =
    typeof result.summary === 'string' ? result.summary.trim() : ''

  if (!content) {
    return {
      ok: false,
      errorCode: 'invalid_empty_result',
      errorMessage: 'Le livrable retourné est vide.',
    }
  }

  if (result.outputFormat === 'markdown' && content.length < MIN_MARKDOWN_CHARS) {
    return {
      ok: false,
      errorCode: 'invalid_too_short',
      errorMessage: `Livrable Markdown trop court (${content.length} caractères).`,
    }
  }

  if (result.outputFormat === 'json') {
    if (!result.structured || typeof result.structured !== 'object') {
      return {
        ok: false,
        errorCode: 'invalid_not_object',
        errorMessage: 'Le livrable JSON est mal formé.',
      }
    }
    if (Object.keys(result.structured).length < MIN_JSON_KEYS) {
      return {
        ok: false,
        errorCode: 'invalid_too_short',
        errorMessage: 'Le livrable JSON est trop pauvre pour être utile.',
      }
    }
  }

  return {
    ok: true,
    normalizedContent: content,
    normalizedSummary: summary || content.slice(0, 200),
  }
}

// ---------------------------------------------------------------------
// generateMissionFallback
// ---------------------------------------------------------------------
// Builds a structured-but-honest deliverable per mission type so the UI
// always shows something actionable. The body MUST clearly disclose
// "version fallback générée sans réponse IA complète".
// ---------------------------------------------------------------------

export interface FallbackInput {
  def: AgentMissionDefinition
  ctx: AgentRunContext
  reason: string
}

export interface FallbackOutput {
  title: string
  summary: string
  content: string
  structured: Record<string, unknown>
}

function ventureLabel(ctx: AgentRunContext): string {
  return ctx.workspace.name || 'votre projet'
}

function ideaLine(ctx: AgentRunContext): string {
  return ctx.context.business_idea
    ? `Idée actuelle : ${ctx.context.business_idea}`
    : 'Idée pas encore renseignée — à compléter dans le QG.'
}

function targetLine(ctx: AgentRunContext): string {
  return ctx.context.target_customer
    ? `Cible probable : ${ctx.context.target_customer}`
    : 'Cible client à clarifier — hypothèse à valider.'
}

function disclaimer(reason: string): string {
  return [
    '> **Note importante :** cette version a été générée sans réponse IA complète',
    `> (raison technique : ${reason}). Le contenu ci-dessous reste un point de départ`,
    "> utile, mais doit être enrichi par une nouvelle exécution de l'agent.",
  ].join('\n')
}

function scanFallback(input: FallbackInput): FallbackOutput {
  const { ctx, reason } = input
  const name = ventureLabel(ctx)
  const md = `# Analyse de marché — version fallback (${name})

${disclaimer(reason)}

## 1. Hypothèses de marché
- ${ideaLine(ctx)}
- Marché supposé : ${ctx.context.market ?? 'à préciser (vertical, géographie, taille).'}
- Stade : ${ctx.workspace.stage || 'idée'}.

## 2. Segments clients possibles
- Segment principal : ${ctx.context.target_customer ?? 'à définir (rôle + contexte).'}
- Segment secondaire : prospects adjacents avec un pain similaire.
- Segment exclu : tout segment hors budget ou trop éloigné du pitch initial.

## 3. Concurrents à analyser
- 2 à 3 concurrents directs à identifier via Google + LinkedIn.
- 1 alternative au statu quo (Excel, agence, équipe interne).
- 1 acteur "premium" qui sert de référence prix.

## 4. Problèmes clients probables
- Pain primaire : à valider en 5 interviews clients.
- Pain secondaire : friction process, dépendance à un outil legacy.
- Pain caché : coût d'opportunité (temps perdu, opportunités ratées).

## 5. Opportunités immédiates
- Tester un message court sur LinkedIn auprès de 20 décideurs.
- Cadrer une offre pilote chiffrée pour 1 client design partner.
- Préparer un wireframe de landing page pour mesurer l'intérêt.

## 6. Prochaines actions recommandées
1. Relancer cette mission dès que possible pour obtenir l'analyse complète.
2. Compléter le contexte du QG (cible, marché, contrainte) pour une meilleure exécution.
3. Lancer en parallèle la mission "Clarifier mon idée business" si ce n'est pas déjà fait.

${targetLine(ctx)}`

  return {
    title: `Analyse de marché — version fallback (${name})`,
    summary:
      "Première version générée sans IA complète. À compléter par une nouvelle exécution.",
    content: md,
    structured: {
      title: `Analyse de marché — version fallback (${name})`,
      summary:
        "Première version générée sans IA complète. À compléter par une nouvelle exécution.",
      markdown: md,
      recommended_next_missions: [
        {
          title: "Clarifier mon idée business",
          description:
            "Reformuler l'idée, le client cible et la promesse en sortie actionnable.",
          agent_role: 'strategist',
          mission_type: 'clarify-business-idea',
          priority: 'high',
        },
        {
          title: 'Définir mon segment cible',
          description: 'Préciser le persona acheteur et ses signaux d\'achat.',
          agent_role: 'strategist',
          mission_type: 'segment',
          priority: 'medium',
        },
      ],
      used_fallback: true,
      fallback_reason: reason,
    },
  }
}

function clarifyFallback(input: FallbackInput): FallbackOutput {
  const { ctx, reason } = input
  const name = ventureLabel(ctx)
  const idea =
    ctx.context.business_idea ?? ctx.workspace.description ?? 'À préciser'
  const target = ctx.context.target_customer ?? 'À préciser'

  const structured = {
    title: `Clarification de l'idée — version fallback (${name})`,
    summary:
      "Version de secours produite sans IA complète. À régénérer pour une analyse approfondie.",
    business_idea: idea,
    target_customer: target,
    problem: 'Pain client à valider en 5 interviews qualitatives.',
    value_proposition:
      'Promesse à reformuler après confrontation au marché.',
    key_assumptions: [
      'Le segment ciblé est joignable via LinkedIn ou cold email.',
      'Le pain est suffisamment fort pour générer un budget court terme.',
      'Une première offre pilote peut être livrée en moins de 6 semaines.',
    ],
    risks: [
      "Pas assez d'intensité du pain pour déclencher un achat.",
      'Concurrent legacy difficile à déloger.',
      'Coût d\'acquisition supérieur à la marge initiale.',
    ],
    recommended_next_missions: [
      {
        title: 'Analyser mon marché',
        description:
          'Rapport d\'opportunité avec segments, concurrents, pain validé.',
        agent_role: 'strategist',
        mission_type: 'scan',
        priority: 'high',
      },
      {
        title: 'Définir mon segment cible',
        description: 'Préciser le persona acheteur.',
        agent_role: 'strategist',
        mission_type: 'segment',
        priority: 'medium',
      },
    ],
    context_updates: {},
    memory_items: [],
    used_fallback: true,
    fallback_reason: reason,
  }

  const md = `# Clarification de l'idée — version fallback

${disclaimer(reason)}

- **Idée actuelle** : ${idea}
- **Cible** : ${target}
- **Étape suivante** : relancer la mission pour générer la version complète.
`

  return {
    title: structured.title,
    summary: structured.summary,
    content: md,
    structured,
  }
}

function genericFallback(input: FallbackInput): FallbackOutput {
  const { ctx, reason, def } = input
  const name = ventureLabel(ctx)
  const md = `# ${ctx.missionTitle} — version fallback (${name})

${disclaimer(reason)}

## Contexte
- ${ideaLine(ctx)}
- ${targetLine(ctx)}
- Type de mission : ${def.missionType}.

## Premières pistes
- Reformuler l'objectif de la mission en une phrase actionnable.
- Identifier 2 à 3 livrables intermédiaires possibles.
- Préparer les données nécessaires à une nouvelle exécution.

## Prochaines actions
1. Relancer cette mission dès que possible.
2. Compléter le contexte du QG si des champs sont vides.
`

  return {
    title: `${ctx.missionTitle} — version fallback (${name})`,
    summary:
      "Première version produite sans IA complète. À régénérer pour le livrable final.",
    content: md,
    structured: {
      title: `${ctx.missionTitle} — version fallback (${name})`,
      summary:
        "Première version produite sans IA complète. À régénérer pour le livrable final.",
      markdown: md,
      recommended_next_missions: [],
      used_fallback: true,
      fallback_reason: reason,
    },
  }
}

export function generateMissionFallback(input: FallbackInput): FallbackOutput {
  switch (input.def.missionType) {
    case 'scan':
      return scanFallback(input)
    case 'clarify-business-idea':
      return clarifyFallback(input)
    default:
      return genericFallback(input)
  }
}

// ---------------------------------------------------------------------
// humanizeErrorCode
// ---------------------------------------------------------------------
// Translates internal error codes into UI-friendly French descriptions
// for activity_events.description. Never expose raw codes to end users.
// ---------------------------------------------------------------------
export function humanizeErrorCode(rawError: string): string {
  const code = rawError.split(':')[0]?.trim() ?? rawError
  switch (code) {
    case 'empty_completion':
      return "L'IA n'a pas renvoyé de contenu exploitable.";
    case 'invalid_empty_result':
      return 'Le livrable produit était vide.';
    case 'invalid_too_short':
      return 'Le livrable produit était trop court.';
    case 'invalid_not_object':
      return 'Le livrable JSON était mal formé.';
    case 'missing_ai_api_key':
      return "Clé API IA manquante côté serveur. L'administrateur doit la configurer.";
    case 'llm_call_failed':
      return "L'appel à l'IA a échoué. Crédit remboursé, relancez la mission.";
    case 'plan_phase_failed':
      return "L'agent n'a pas pu planifier la mission. Crédit remboursé.";
    case 'act_phase_failed':
      return "L'agent n'a pas pu produire le livrable. Crédit remboursé.";
    case 'json_parse_failed':
    case 'schema_invalid':
      return "Le livrable IA ne respecte pas le format attendu.";
    case 'deliverable_insert_failed':
      return "Sauvegarde du livrable impossible. Crédit remboursé.";
    case 'mission_not_found':
      return 'Mission introuvable.';
    case 'mission_forbidden':
      return 'Accès refusé à cette mission.';
    case 'workspace_not_found':
      return 'Filiale introuvable.';
    case 'unexpected_error':
      return "Erreur technique inattendue. Crédit remboursé, réessayez.";
    default:
      return "Une erreur technique est survenue. Réessayez dans un instant.";
  }
}

// ---------------------------------------------------------------------
// isRecoverableEmpty
// ---------------------------------------------------------------------
// Distinguishes errors where a fallback is appropriate (LLM returned
// nothing, schema wobble) from hard failures where we must refund and
// flip the mission to `failed` (network exception, missing key, etc.).
// ---------------------------------------------------------------------
export function isRecoverableEmpty(errorCode: string): boolean {
  const head = errorCode.split(':')[0]?.trim() ?? errorCode
  return (
    head === 'empty_completion' ||
    head === 'invalid_empty_result' ||
    head === 'invalid_too_short' ||
    head === 'invalid_not_object' ||
    head === 'invalid_no_summary' ||
    head === 'json_parse_failed' ||
    head === 'schema_invalid'
  )
}
