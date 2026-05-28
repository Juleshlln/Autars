// =====================================================================
// Strategist agent — clarify-business-idea (structured JSON) + scan (markdown)
// =====================================================================

import type {
  AgentMissionDefinition,
  AgentRunContext,
  ClarifyBusinessIdeaOutput,
} from './types'

const NEXT_MISSION_HINTS = `Pour recommended_next_missions, choisis 2 à 4 missions concrètes parmi :
- agent_role="strategist" : "segment" (définir le client cible), "value-prop" (proposition de valeur), "positioning" (positionnement April Dunford), "scan" (rapport d'opportunité de marché)
- agent_role="builder" : "offer" (première offre testable), "landing" (landing page), "brand-kit" (kit de marque)
- agent_role="growth" : "acquisition" (plan d'acquisition initial)
- agent_role="finance" : pas de mission_type dédié, ignore pour l'instant.
priority="high" pour la mission la plus bloquante, "medium" sinon. Pas de "low" sauf justification claire.`

function contextBlock(ctx: AgentRunContext): string {
  const lines: string[] = []
  lines.push(`Filiale : ${ctx.workspace.name}`)
  if (ctx.workspace.description) lines.push(`Pitch : ${ctx.workspace.description}`)
  if (ctx.context.business_idea) lines.push(`Idée business : ${ctx.context.business_idea}`)
  if (ctx.context.target_customer)
    lines.push(`Cible identifiée : ${ctx.context.target_customer}`)
  if (ctx.context.market) lines.push(`Marché : ${ctx.context.market}`)
  if (ctx.context.tone) lines.push(`Tonalité : ${ctx.context.tone}`)
  if (ctx.context.constraints) lines.push(`Contraintes : ${ctx.context.constraints}`)
  if (ctx.context.goals) lines.push(`Objectifs : ${ctx.context.goals}`)
  return lines.join('\n')
}

function previousDeliverablesBlock(ctx: AgentRunContext): string {
  if (ctx.previousDeliverables.length === 0) return ''
  const parts = ctx.previousDeliverables.slice(0, 5).map((d, i) => {
    const decision = d.decision ? ` — décision : ${d.decision}` : ''
    const summary = d.summary ? `\n  Résumé : ${d.summary}` : ''
    return `[${i + 1}] ${d.mission_title}${decision}${summary}`
  })
  return `\nLivrables précédents :\n${parts.join('\n')}`
}

function memoryBlock(ctx: AgentRunContext): string {
  if (ctx.agentMemory.length === 0) return ''
  const parts = ctx.agentMemory.slice(0, 10).map((m) => `- (${m.memory_type}) ${m.content}`)
  return `\nMémoire agent :\n${parts.join('\n')}`
}

// ---------------------------------------------------------------------
// clarify-business-idea — structured JSON output
// ---------------------------------------------------------------------
const CLARIFY_SYSTEM = `Tu es le Stratège d'Autars. Tu aides un fondateur à clarifier son idée business pour la rendre actionnable.

Ton rôle pour cette mission :
1. Reformuler l'idée business en une phrase claire (qui aide qui à obtenir quoi grâce à quoi).
2. Identifier le client cible le plus précis possible.
3. Formuler le problème en termes de douleur client (pas en termes de solution).
4. Proposer une proposition de valeur défendable.
5. Lister les hypothèses risquées (3-5).
6. Lister les risques business (3-5).
7. Recommander 2-4 missions suivantes prioritaires.

Tu reçois le contexte du QG (filiale, idée, cible déjà identifiée si dispo, livrables précédents, mémoire agent).

FORMAT DE SORTIE OBLIGATOIRE : un unique objet JSON valide, sans texte avant ni après, sans bloc \`\`\`. Suis ce schéma exactement :
{
  "title": "Clarification de l'idée business",
  "summary": "<3 phrases max : reformulation actionnable de l'idée>",
  "business_idea": "<une phrase : qui aide qui à obtenir quoi>",
  "target_customer": "<persona précis : rôle/contexte/signaux>",
  "problem": "<douleur client en termes client, pas en termes de solution>",
  "value_proposition": "<promesse défendable, mesurable si possible>",
  "key_assumptions": ["<hypothèse 1>", "<hypothèse 2>", "..."],
  "risks": ["<risque 1>", "<risque 2>", "..."],
  "recommended_next_missions": [
    {
      "title": "<titre court>",
      "description": "<2 phrases>",
      "agent_role": "strategist" | "builder" | "growth" | "finance",
      "mission_type": "<voir liste ci-dessous>",
      "priority": "high" | "medium" | "low"
    }
  ],
  "context_updates": {
    "business_idea": "<optionnel — mise à jour à persister dans workspace_context>",
    "target_customer": "<optionnel>",
    "market": "<optionnel>",
    "constraints": "<optionnel>",
    "goals": "<optionnel>"
  },
  "memory_items": [
    { "memory_type": "fact" | "preference" | "constraint" | "validated_decision" | "rejected_idea", "content": "<une phrase>" }
  ]
}

${NEXT_MISSION_HINTS}

Règles :
- Pas de superlatifs vides. Pas d'emoji.
- Si l'utilisateur a déjà rempli target_customer ou business_idea, raffine au lieu de remplacer.
- key_assumptions ET risks sont distincts : assumptions = ce qu'on tient pour vrai sans preuve ; risks = ce qui peut faire échouer.
- Ne mets PAS de markdown, PAS de commentaires JSON, juste un objet JSON valide.`

function buildClarifyUserPrompt(ctx: AgentRunContext): string {
  const sections = [contextBlock(ctx)]
  if (ctx.missionDescription)
    sections.push(`\nMission demandée : ${ctx.missionTitle}\n${ctx.missionDescription}`)
  sections.push(previousDeliverablesBlock(ctx))
  sections.push(memoryBlock(ctx))
  if (ctx.iterationFeedback) {
    sections.push(`\n\nDemande d'amélioration du fondateur :\n${ctx.iterationFeedback}`)
    if (ctx.previousDeliverableContent) {
      sections.push(
        `\nVersion précédente du livrable :\n${JSON.stringify(
          ctx.previousDeliverableContent,
          null,
          2,
        )}`,
      )
    }
    sections.push(
      `\nProduis une nouvelle version qui intègre le feedback. Garde ce qui était bon, corrige ce qui ne l'était pas.`,
    )
  } else {
    sections.push(`\nProduis le livrable JSON maintenant.`)
  }
  return sections.filter(Boolean).join('\n')
}

function validateClarify(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return 'not an object'
  const o = parsed as Partial<ClarifyBusinessIdeaOutput>
  if (typeof o.title !== 'string' || !o.title) return 'missing title'
  if (typeof o.summary !== 'string' || !o.summary) return 'missing summary'
  if (typeof o.business_idea !== 'string') return 'missing business_idea'
  if (typeof o.target_customer !== 'string') return 'missing target_customer'
  if (typeof o.problem !== 'string') return 'missing problem'
  if (typeof o.value_proposition !== 'string') return 'missing value_proposition'
  if (!Array.isArray(o.key_assumptions)) return 'missing key_assumptions'
  if (!Array.isArray(o.risks)) return 'missing risks'
  if (!Array.isArray(o.recommended_next_missions)) return 'missing recommended_next_missions'
  return null
}

export const STRATEGIST_CLARIFY: AgentMissionDefinition = {
  role: 'strategist',
  missionType: 'clarify-business-idea',
  outputFormat: 'json',
  systemPrompt: CLARIFY_SYSTEM,
  buildUserPrompt: buildClarifyUserPrompt,
  model: 'claude-sonnet-4-5',
  maxTokens: 4000,
  enableWebSearch: false,
  enableWebFetch: false,
  // Clarify is intentionally tool-free: it must converge on a single JSON
  // structured output without going off to scrape the web.
  tools: [],
  validateOutput: validateClarify,
}

// ---------------------------------------------------------------------
// scan — opportunity report (markdown, with web tools)
// ---------------------------------------------------------------------
const SCAN_SYSTEM = `Tu es le Stratège d'Autars. Tu produis un Rapport d'opportunité actionnable en Markdown.

Tu disposes des outils web_search ET web_fetch. Utilise-les pour valider la taille du marché, identifier 3-5 concurrents réels avec URL, repérer un pain verbatim. Cite les URLs sources.

Sections obligatoires :
# Rapport d'opportunité — <nom de la filiale>
## TL;DR
## Segments prioritaires
(3 segments numérotés, justification chiffrée)
## Concurrents et alternatives au statu quo
(table : nom · URL · pourquoi on gagne)
## Différentiel défendable
## Pain validé
(verbatim avec source URL)
## Risques
## Prochain pas concret

Ton : précis, chiffré, sec. Pas de superlatifs vides. Pas d'emoji.

À la fin du rapport, ajoute une dernière section invisible pour le lecteur mais nécessaire au système :
<!--AUTARS_NEXT_MISSIONS:[{"title":"...","description":"...","agent_role":"strategist|builder|growth|finance","mission_type":"...","priority":"high|medium|low"}]-->
${NEXT_MISSION_HINTS}`

function buildScanUserPrompt(ctx: AgentRunContext): string {
  return [
    contextBlock(ctx),
    ctx.missionDescription ? `\nMission demandée : ${ctx.missionDescription}` : '',
    previousDeliverablesBlock(ctx),
    memoryBlock(ctx),
    ctx.iterationFeedback ? `\nAmélioration demandée :\n${ctx.iterationFeedback}` : '',
    `\nGénère le rapport d'opportunité. Utilise web_search pour valider concurrents et pain.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export const STRATEGIST_SCAN: AgentMissionDefinition = {
  role: 'strategist',
  missionType: 'scan',
  outputFormat: 'markdown',
  systemPrompt: SCAN_SYSTEM,
  buildUserPrompt: buildScanUserPrompt,
  model: 'claude-sonnet-4-5',
  maxTokens: 6000,
  enableWebSearch: true,
  enableWebFetch: true,
  // Anthropic's OpenAI-compat endpoint currently hangs on multi-iteration
  // tool loops; cap tool calls to a single round-trip until we switch to
  // the native Anthropic SDK or to OpenAI proper.
  maxToolIterations: 2,
}
