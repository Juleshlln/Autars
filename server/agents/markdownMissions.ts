// =====================================================================
// Markdown mission definitions — one per (role, missionType)
// =====================================================================
// Before this file existed, only `clarify-business-idea` and `scan` were
// registered, so EVERY other mission type silently fell back to the
// clarify prompt and produced a generic "business clarification" instead
// of the deliverable the user asked for (landing page, pricing, …).
//
// Each definition here is a Markdown deliverable. The orchestrator
// (`runAgentMission`) automatically appends the `<!--AUTARS_METADATA:…-->`
// contract to the system prompt and extracts `summary`,
// `recommended_next_missions`, `memory_items` and `context_updates` from
// it — so the prompts below only need to describe the human-readable
// document and its required sections.
//
// Tool calling is disabled (`tools: []`) on purpose: these missions must
// converge to a usable document deterministically and cheaply. Web-tool
// missions (scan/positioning research) stay in `strategist.ts`.
// =====================================================================

import type { AgentMissionDefinition, AgentRole, AgentRunContext } from './types'

// ---------------------------------------------------------------------
// Shared context block — keeps every deliverable grounded in the user's
// real business idea, prior validated work and agent memory.
// ---------------------------------------------------------------------
function contextBlock(ctx: AgentRunContext): string {
  const lines: string[] = []
  lines.push(`Filiale (QG) : ${ctx.workspace.name}`)
  if (ctx.workspace.description) lines.push(`Pitch : ${ctx.workspace.description}`)
  if (ctx.workspace.stage) lines.push(`Stade : ${ctx.workspace.stage}`)
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
  return `\nLivrables déjà validés (réutilise-les, ne les contredis pas) :\n${parts.join('\n')}`
}

function memoryBlock(ctx: AgentRunContext): string {
  if (ctx.agentMemory.length === 0) return ''
  const parts = ctx.agentMemory.slice(0, 10).map((m) => `- (${m.memory_type}) ${m.content}`)
  return `\nMémoire agent :\n${parts.join('\n')}`
}

function buildMarkdownUserPrompt(ctx: AgentRunContext): string {
  const sections = [contextBlock(ctx)]
  if (ctx.missionDescription) {
    sections.push(`\nMission demandée : ${ctx.missionTitle}\n${ctx.missionDescription}`)
  }
  sections.push(previousDeliverablesBlock(ctx))
  sections.push(memoryBlock(ctx))
  if (ctx.iterationFeedback) {
    sections.push(`\n\nDemande d'amélioration du fondateur :\n${ctx.iterationFeedback}`)
    if (ctx.previousDeliverableContent) {
      sections.push(
        `\nVersion précédente du livrable :\n${JSON.stringify(
          ctx.previousDeliverableContent,
        ).slice(0, 4000)}`,
      )
    }
    sections.push(
      `\nProduis une NOUVELLE version qui intègre ce feedback. Garde ce qui marchait.`,
    )
  } else {
    sections.push(`\nProduis le livrable Markdown maintenant.`)
  }
  return sections.filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------
interface MarkdownMissionConfig {
  role: AgentRole
  missionType: AgentMissionDefinition['missionType']
  /** Role + mission instructions and the required Markdown sections. */
  systemPrompt: string
  maxTokens?: number
}

const COMMON_RULES = `
Règles de qualité (impératives) :
- Écris en français. Pas d'emoji. Pas de superlatifs vides ("révolutionnaire", "incroyable").
- ANCRE chaque section dans l'idée business réelle ci-dessus. Jamais de contenu générique du type "Voici votre livrable".
- Sois concret, chiffré et actionnable. Si une donnée manque, énonce une hypothèse explicite plutôt que d'inventer un faux chiffre.
- Le document doit être directement exploitable par un fondateur pour avancer.`

function markdownMission(cfg: MarkdownMissionConfig): AgentMissionDefinition {
  return {
    role: cfg.role,
    missionType: cfg.missionType,
    outputFormat: 'markdown',
    systemPrompt: `${cfg.systemPrompt}\n${COMMON_RULES}`,
    buildUserPrompt: buildMarkdownUserPrompt,
    model: 'claude-sonnet-4-5',
    maxTokens: cfg.maxTokens ?? 4500,
    enableWebSearch: false,
    enableWebFetch: false,
    // Deterministic single-shot generation — no tool loop.
    tools: [],
  }
}

// ---------------------------------------------------------------------
// Strategist
// ---------------------------------------------------------------------
const SEGMENT = markdownMission({
  role: 'strategist',
  missionType: 'segment',
  systemPrompt: `Tu es le Stratège d'Autars. Tu produis un PERSONA CLIENT et la priorisation des segments.

Sections obligatoires :
# Client cible — <nom de la filiale>
## TL;DR
(le segment prioritaire en 2 phrases + pourquoi lui en premier)
## Segments candidats
(table : segment · taille/accessibilité · douleur · capacité à payer · priorité)
## Persona prioritaire
(prénom fictif, rôle, contexte, journée type, déclencheur d'achat)
## Jobs-to-be-done
(3 à 5 "Quand je…, je veux…, afin de…")
## Canaux pour l'atteindre
(où ce persona est réellement joignable)
## Hypothèses à valider
(3 hypothèses risquées + comment les tester vite)`,
})

const VALUE_PROP = markdownMission({
  role: 'strategist',
  missionType: 'value-prop',
  systemPrompt: `Tu es le Stratège d'Autars. Tu produis une PROPOSITION DE VALEUR défendable.

Sections obligatoires :
# Proposition de valeur — <nom>
## Promesse centrale
(une phrase, du point de vue du client : résultat obtenu, pas la techno)
## Pour qui / pas pour qui
## Douleurs → Gains
(table : douleur client · comment on la supprime · gain mesurable)
## Différenciateurs défendables
(3 max, pourquoi un concurrent ne peut pas copier vite)
## Preuves à réunir
(ce qu'il faut montrer pour rendre la promesse crédible)
## Pitch en 1 ligne
(format : "Nous aidons <qui> à <résultat> sans <friction>")`,
})

const POSITIONING = markdownMission({
  role: 'strategist',
  missionType: 'positioning',
  systemPrompt: `Tu es le Stratège d'Autars. Tu produis un BRIEF DE POSITIONNEMENT (framework April Dunford).

Sections obligatoires :
# Positionnement — <nom>
## Catégorie de marché
(une phrase : "Nous sommes UN <quoi> pour <qui>")
## Alternatives au statu quo
(table : alternative actuelle · sa faiblesse · pourquoi on gagne)
## Attributs uniques
(ce que nous avons et que les alternatives n'ont pas)
## Valeur livrée
(les attributs traduits en bénéfices business)
## Client idéal (ICP)
(rôle / taille / stade / signaux d'achat)
## Messages clés (3)
## Test de message
(2-3 variations A/B à pousser en cold email ou Ads)`,
})

const BUSINESS_MODEL = markdownMission({
  role: 'strategist',
  missionType: 'business-model',
  maxTokens: 5000,
  systemPrompt: `Tu es le Stratège d'Autars. Tu produis un BUSINESS MODEL initial (logique Business Model Canvas, version actionnable).

Sections obligatoires :
# Business model — <nom>
## TL;DR
(comment l'entreprise gagne de l'argent, en 2 phrases)
## Segments clients & proposition de valeur
## Sources de revenus
(modèle : abonnement / one-shot / commission / freemium · justification)
## Structure de coûts
(coûts fixes vs variables principaux)
## Ressources & activités clés
## Canaux & relation client
## Boucle de croissance
(comment 1 client en amène d'autres)
## Risques du modèle & prochain test`,
})

// ---------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------
const OFFER = markdownMission({
  role: 'builder',
  missionType: 'offer',
  systemPrompt: `Tu es le Builder d'Autars. Tu produis une PREMIÈRE OFFRE COMMERCIALE testable et monétisable rapidement.

Sections obligatoires :
# Première offre — <nom>
## Nom de l'offre & promesse
## Ce qui est inclus
(livrables/fonctions concrets, format de livraison)
## Prix de départ & justification
(un prix précis, pas une fourchette floue)
## Pour qui (et pour qui ce n'est pas)
## Objections probables & réponses
## Comment la vendre cette semaine
(canal + script d'accroche en 3 lignes)
## Critère de succès
(combien de ventes/feedbacks valident l'offre)`,
})

const LANDING = markdownMission({
  role: 'builder',
  missionType: 'landing',
  maxTokens: 5000,
  systemPrompt: `Tu es le Builder d'Autars. Tu produis le WIREFRAME + LE COPYWRITING d'une landing page de conversion.

Sections obligatoires :
# Landing page — <nom>
## Objectif & action attendue
(une seule CTA principale)
## Hero
(titre H1 percutant · sous-titre · texte du bouton CTA)
## Bénéfices (3 blocs)
(table : titre court · phrase de preuve)
## Comment ça marche (3 étapes)
## Preuve sociale / réassurance
(ce qu'il faut afficher même au début : garanties, logos, FAQ)
## Section finale + CTA répétée
## Notes de design
(ton visuel, hiérarchie, ce qu'il faut ÉVITER)`,
})

const ROADMAP = markdownMission({
  role: 'builder',
  missionType: 'roadmap',
  maxTokens: 5000,
  systemPrompt: `Tu es le Builder d'Autars. Tu produis une ROADMAP MVP priorisée.

Sections obligatoires :
# Roadmap MVP — <nom>
## Objectif du MVP
(la seule chose que le MVP doit prouver)
## Périmètre v1 (must-have)
(table : fonctionnalité · pourquoi indispensable · effort estimé S/M/L)
## Volontairement exclu de la v1
(ce qu'on ne fait PAS maintenant, et pourquoi)
## Parcours utilisateur principal
(les étapes clés, du premier contact au résultat)
## Séquence de build (3 jalons)
(jalon 1 / 2 / 3 avec critère de sortie de chacun)
## Risques techniques & dépendances`,
})

const BRAND_KIT = markdownMission({
  role: 'builder',
  missionType: 'brand-kit',
  systemPrompt: `Tu es le Builder d'Autars (volet identité). Tu produis un KIT DE MARQUE actionnable.

Sections obligatoires :
# Kit de marque — <nom>
## Wordmark
(nom retenu + 2 alternatives)
## Accroche
(une phrase, 8 mots max)
## Personnalité de marque
(3 adjectifs · 2 à éviter)
## Ton de voix
(3 "à faire" · 3 "à éviter")
## Système typographique
(display + body · privilégie des fonts gratuites/Google)
## Palette
(table : token · hex · usage)
## À éviter
(3 pièges visuels concrets)`,
})

// ---------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------
const ACQUISITION = markdownMission({
  role: 'growth',
  missionType: 'acquisition',
  systemPrompt: `Tu es le Growth d'Autars. Tu produis un PLAN D'ACQUISITION initial réaliste pour un budget serré.

Sections obligatoires :
# Plan d'acquisition — <nom>
## TL;DR
(les 2 canaux à tester en premier + pourquoi eux)
## Choix des canaux
(table : canal · effort · coût · délai de résultat · adéquation cible)
## Plan des 2 canaux prioritaires
(pour chacun : message d'accroche, fréquence, première action concrète)
## Cold outreach
(script en 4 lignes prêt à copier-coller, personnalisable)
## Métriques à suivre
(2-3 indicateurs simples + objectif chiffré à 30 jours)
## Pièges à éviter`,
})

const CONTENT_PLAN = markdownMission({
  role: 'growth',
  missionType: 'content-plan',
  maxTokens: 5000,
  systemPrompt: `Tu es le Growth d'Autars. Tu produis un PLAN DE CONTENU sur 7 jours, prêt à exécuter.

Sections obligatoires :
# Plan de contenu 7 jours — <nom>
## Angle éditorial
(le fil rouge, à qui on parle, quelle action on veut déclencher)
## Calendrier
(table : Jour · canal · format · titre/hook · CTA)
## 3 hooks réutilisables
(accroches prêtes à publier)
## Règle de recyclage
(comment transformer 1 contenu en 3)
## Indicateur de réussite de la semaine`,
})

// ---------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------
const PRICING = markdownMission({
  role: 'finance',
  missionType: 'pricing',
  systemPrompt: `Tu es l'agent Finance d'Autars. Tu produis une STRATÉGIE DE PRICING claire et défendable.

Sections obligatoires :
# Pricing — <nom>
## Logique de prix retenue
(value-based / coût-plus / concurrentiel · pourquoi)
## Grille tarifaire
(table : offre/palier · prix · ce qui est inclus · cible)
## Ancrage & psychologie
(comment présenter les prix pour maximiser la valeur perçue)
## Seuil de rentabilité simplifié
(combien de ventes pour couvrir les coûts — pose les hypothèses)
## Tests de prix
(2 expériences concrètes pour valider le willingness-to-pay)
## Erreurs de pricing à éviter`,
})

// ---------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------
export const MARKDOWN_MISSIONS: AgentMissionDefinition[] = [
  SEGMENT,
  VALUE_PROP,
  POSITIONING,
  BUSINESS_MODEL,
  OFFER,
  LANDING,
  ROADMAP,
  BRAND_KIT,
  ACQUISITION,
  CONTENT_PLAN,
  PRICING,
]
