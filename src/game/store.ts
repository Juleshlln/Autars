import { create } from 'zustand'
import {
  streamBriefTurn,
  streamMission,
  type BriefMessage,
  type MissionKey,
  type VentureContext,
} from './llm'
import { MISSION_META } from './missions'

/* ============================================================
   Types
   ============================================================ */

export type AgentLifeState =
  | 'idle'
  | 'walking'
  | 'working'
  | 'celebrating'
  | 'delivered'
  | 'locked'

export type WorkspaceKind =
  | 'desk'
  | 'computer'
  | 'whiteboard'
  | 'brainstorm-board'
  | 'server-rack'
  | 'coffee-machine'

export interface Workspace {
  id: string
  kind: WorkspaceKind
  /** Tile coordinates (column, row) on the office grid. */
  x: number
  y: number
  /** Optional direction the agent should face once parked. */
  face?: 'left' | 'right' | 'up' | 'down'
  label?: string
}

export interface AgentRuntime {
  id: string
  name: string
  className: string
  /** Pixel-art palette name. */
  palette: AgentPalette
  /** Static portrait color used by the side panels. */
  themeColor: string
  level: number
  reliability: number
  impactLabel: string
  description: string
  /** Mission progress in [0..1]. */
  progress: number
  /** Logical state. */
  state: AgentLifeState
  /** Workspace assigned for the current task. */
  workspaceId: string | null
  /** Optional spawn / home desk. */
  homeWorkspaceId: string
  /** Cost to unlock if locked. */
  unlockCost?: number
  /** Static cosmetic seed for sprite generation. */
  spriteSeed: number
  /** Display order for the side panel. */
  order: number
  /** Optional accessory/description. */
  accessory: string
  /** Pending speech bubble emote ("!", "✓", "?"). */
  emote: string | null
  /** Pending mission entries queued behind the active mission. */
  taskQueue: QueuedTask[]
}

export interface QueuedTask {
  templateId: string
  contextDeliverableId?: string | null
}

export interface AgentPalette {
  skin: number
  hair: number
  shirt: number
  shirtAccent: number
  pants: number
  shoes: number
  hatTop?: number
  hatBrim?: number
  glasses?: number
}

export interface MissionRuntime {
  id: string
  agentId: string
  title: string
  output: string
  templateId: string
  /** Mission duration in ms. */
  durationMs: number
  /** SaaS credit cost charged against the monthly plan. */
  creditCost: number
  /** Commercial value used later by the marketplace sale engine. */
  reward: number
  /** Started at timestamp (performance.now). */
  startedAt: number
  /** Cached progress (0..1). */
  progress: number
  done: boolean
  /** Optional id of a prior deliverable used as context for this mission. */
  contextDeliverableId?: string | null
}

export type SubscriptionPlan = 'Starter' | 'Pro' | 'Empire'

export interface OfflineReport {
  agentId: string
  agentName: string
  tasksCompleted: number
  creditsSpent: number
  revenueGenerated: number
  deliverableTitles: string[]
}

export interface ActivityLog {
  id: string
  ts: number
  agentId: string
  agentName: string
  message: string
}

export interface MissionDeliverable {
  id: string
  agentId: string
  agentName: string
  missionTitle: string
  generatedAt: number
  /** Markdown content. */
  markdown: string
  /** Structured JSON payload. */
  json: Record<string, unknown>
  /** Id of the deliverable used as context for the mission that produced this one. */
  parentDeliverableId?: string | null
}

export interface ActiveProduct {
  id: string
  ventureId: string
  deliverableId: string | null
  agentId: string
  agentName: string
  title: string
  /** Sale price (already includes any synergy bonus). */
  price: number
  /** Base reward before synergy bonus — used for display. */
  basePrice: number
  /** True when the producing deliverable was built with a parent context. */
  synergyBonus: boolean
  createdAt: number
  status: 'active'
}

export interface Venture {
  id: string
  name: string
  subtitle: string
  industry: string
  level: number
  levelLabel: string
  stage: string
  status: 'active' | 'incubating' | 'paused'
  monthlyRevenue: number
  agentCount: number
  /** Free-form tagline / pitch summary. */
  tagline: string
  /** Date string e.g. "Lancée mai 2026" — used in the Hub card. */
  launchedLabel: string
  themeColor: string
}

export interface GameState {
  /* Multi-venture holding */
  ventures: Record<string, Venture>
  ventureOrder: string[]
  activeVentureId: string
  founderName: string
  founderLevel: number
  founderTitle: string

  /* Active venture (mirror for convenience) */
  ventureName: string
  ventureSubtitle: string
  level: number
  levelLabel: string
  stage: string

  /* Resources */
  xp: number
  credits: number
  reputation: number

  /* SaaS economy */
  subscriptionPlan: SubscriptionPlan
  monthlyCredits: number
  creditsUsedThisMonth: number
  realRevenue: number
  activeProducts: ActiveProduct[]
  passiveSaleLastCheckedAt: number
  /** Last passive sale timestamp (performance.now) — read by the canvas to fire the shockwave VFX. */
  lastSaleAt: number
  /** Amount of the last passive sale — used by the canvas popup. */
  lastSaleAmount: number
  /** Last time a system/infra log was emitted (performance.now). */
  systemLogLastAt: number

  /* HQ */
  hqLevel: number

  /* Agents & workspaces */
  agents: Record<string, AgentRuntime>
  agentOrder: string[]
  workspaces: Record<string, Workspace>

  /* Missions */
  missions: Record<string, MissionRuntime>
  /** Activity logs (newest first). Capped to keep memory bounded. */
  logs: ActivityLog[]
  /** Deliverables produced by missions, keyed by id. */
  deliverables: Record<string, MissionDeliverable>
  /** Latest deliverable id per agent — used by the validation modal. */
  latestDeliverableByAgent: Record<string, string>

  /* UI */
  selectedAgentId: string | null
  contextMenu: { agentId: string; screenX: number; screenY: number } | null
  banner: { tone: 'info' | 'success' | 'warning'; message: string } | null
  drawerAgentId: string | null
  openDeliverableId: string | null
  showOfflineReport: boolean
  offlineReport: OfflineReport | null
  showNewVentureModal: boolean

  /* Real AI brief chat */
  briefChat: {
    missionKey: MissionKey
    agentId: string
    ventureId: string
    messages: BriefMessage[]
    status: 'briefing' | 'streaming' | 'ready' | 'running' | 'error'
    error?: string
    contextDeliverableId?: string | null
  } | null

  /* Briefing modal — lets player attach a prior deliverable as context */
  briefingModal: {
    agentId: string
    mode: 'live' | 'enqueue'
    missionKey?: MissionKey
    missionTemplateId?: string
    title: string
  } | null

  /* Actions */
  selectAgent: (id: string | null) => void
  openContextMenu: (agentId: string, x: number, y: number) => void
  closeContextMenu: () => void
  setAgentState: (id: string, state: AgentLifeState) => void
  setAgentEmote: (id: string, emote: string | null) => void
  startMission: (
    agentId: string,
    missionTemplateId: keyof typeof MISSION_TEMPLATES,
    contextDeliverableId?: string | null,
  ) => void
  enqueueMission: (
    agentId: string,
    missionTemplateId: keyof typeof MISSION_TEMPLATES,
    contextDeliverableId?: string | null,
  ) => void
  completeMission: (agentId: string) => void
  unlockAgent: (id: string) => void
  upgradeHQ: () => void
  tickMissions: (now: number) => void
  setBanner: (banner: { tone: 'info' | 'success' | 'warning'; message: string } | null) => void
  pushLog: (agentId: string, message: string) => void
  pushSystemLog: (channel: 'SYSTEM' | 'ROUTER' | 'DATABASE', message: string) => void
  openAgentDrawer: (id: string | null) => void
  openDeliverable: (id: string | null) => void
  closeOfflineReport: () => void
  collectOfflineReport: () => void
  openNewVentureModal: () => void
  closeNewVentureModal: () => void
  createVenture: (data: {
    industry: string
    name: string
    subtitle: string
    starterAgentId: string
  }) => string
  setActiveVenture: (id: string) => void

  /* Real AI brief chat actions */
  openBriefChat: (missionKey: MissionKey, contextDeliverableId?: string | null) => void
  closeBriefChat: () => void
  sendBriefUserMessage: (text: string) => Promise<void>
  runRealMission: () => Promise<void>

  /* Briefing modal actions */
  openBriefingModal: (
    payload:
      | { agentId: string; mode: 'live'; missionKey: MissionKey; title: string }
      | { agentId: string; mode: 'enqueue'; missionTemplateId: string; title: string },
  ) => void
  closeBriefingModal: () => void
  confirmBriefingModal: (contextDeliverableId: string | null) => void
}

/* ============================================================
   Palettes
   ============================================================ */

const PALETTES: Record<string, AgentPalette> = {
  strategist: {
    skin: 0xf4c89c,
    hair: 0x4b2f1c,
    shirt: 0x2c2c3a,
    shirtAccent: 0xffcf3a,
    pants: 0x1c1c28,
    shoes: 0x0e0e16,
    hatTop: 0xffcf3a,
    hatBrim: 0x3a2a14,
  },
  analyst: {
    skin: 0xf4c89c,
    hair: 0x22d3ee,
    shirt: 0x1a3a4a,
    shirtAccent: 0x67e8f9,
    pants: 0x111827,
    shoes: 0x0a0a0a,
    glasses: 0xffffff,
  },
  brandBuilder: {
    skin: 0xeac0a0,
    hair: 0xa855f7,
    shirt: 0x7c3aed,
    shirtAccent: 0xfbbf24,
    pants: 0x1f1326,
    shoes: 0x0a0a0a,
  },
  offerArchitect: {
    skin: 0xf2c89c,
    hair: 0x2d2d2d,
    shirt: 0x16a34a,
    shirtAccent: 0xfde68a,
    pants: 0x14532d,
    shoes: 0x0a0a0a,
    glasses: 0xffffff,
  },
  growthOperator: {
    skin: 0xf4c89c,
    hair: 0xf97316,
    shirt: 0xea580c,
    shirtAccent: 0xfde68a,
    pants: 0x431407,
    shoes: 0x0a0a0a,
  },
}

/* ============================================================
   Workspaces (tile coordinates on 24×14 office grid)
   ============================================================ */

const WORKSPACES: Workspace[] = [
  { id: 'desk-strategist', kind: 'desk', x: 6, y: 5, face: 'up', label: 'Bureau Stratège' },
  { id: 'desk-analyst', kind: 'desk', x: 12, y: 5, face: 'up', label: 'Bureau Analyste' },
  { id: 'desk-brand', kind: 'desk', x: 18, y: 5, face: 'up', label: 'Bureau Brand' },
  { id: 'desk-offer', kind: 'desk', x: 6, y: 9, face: 'down', label: 'Bureau Offre' },
  { id: 'desk-growth', kind: 'desk', x: 18, y: 9, face: 'down', label: 'Bureau Growth' },
  { id: 'computer-1', kind: 'computer', x: 6, y: 4, face: 'up', label: 'Workstation A' },
  { id: 'computer-2', kind: 'computer', x: 18, y: 4, face: 'up', label: 'Workstation B' },
  { id: 'whiteboard', kind: 'whiteboard', x: 12, y: 3, face: 'up', label: 'Tableau blanc' },
  { id: 'brainstorm', kind: 'brainstorm-board', x: 4, y: 11, face: 'down', label: 'Brainstorming' },
  { id: 'server', kind: 'server-rack', x: 20, y: 11, face: 'down', label: 'Serveur' },
  { id: 'coffee', kind: 'coffee-machine', x: 12, y: 11, face: 'down', label: 'Pause' },
]

/* ============================================================
   Seed agents — matches the test data the user listed
   ============================================================ */

function makeAgents(): Record<string, AgentRuntime> {
  const seed: Array<Omit<AgentRuntime, 'taskQueue'>> = [
    {
      id: 'strategist',
      name: 'Stratège',
      className: 'Architecte de la vision',
      palette: PALETTES.strategist!,
      themeColor: '#FFCF3A',
      level: 1,
      reliability: 70,
      impactLabel: 'Nouvelle recrue',
      description: 'Cartographie le marché et la promesse centrale du projet.',
      progress: 0,
      state: 'idle',
      workspaceId: 'desk-strategist',
      homeWorkspaceId: 'desk-strategist',
      spriteSeed: 1,
      order: 0,
      accessory: 'casquette jaune',
      emote: null,
    },
    {
      id: 'analyst',
      name: 'Analyste Marché',
      className: 'Œil quantitatif',
      palette: PALETTES.analyst!,
      themeColor: '#22D3EE',
      level: 1,
      reliability: 0,
      impactLabel: 'Recrutement bloqué',
      description: 'Croise données marché et signaux pour valider les hypothèses.',
      progress: 0,
      state: 'locked',
      workspaceId: null,
      homeWorkspaceId: 'desk-analyst',
      unlockCost: 150,
      spriteSeed: 2,
      order: 1,
      accessory: 'cheveux turquoise',
      emote: null,
    },
    {
      id: 'brandBuilder',
      name: 'Brand Builder',
      className: 'Directeur·rice artistique',
      palette: PALETTES.brandBuilder!,
      themeColor: '#C084FC',
      level: 1,
      reliability: 0,
      impactLabel: 'Recrutement bloqué',
      description: 'Construit la direction de marque dès qu\'il sera recruté.',
      progress: 0,
      state: 'locked',
      workspaceId: null,
      homeWorkspaceId: 'desk-brand',
      unlockCost: 250,
      spriteSeed: 3,
      order: 2,
      accessory: 'silhouette',
      emote: null,
    },
    {
      id: 'offerArchitect',
      name: 'Architecte d\'Offre',
      className: 'Sculpteur de pricing',
      palette: PALETTES.offerArchitect!,
      themeColor: '#34D399',
      level: 1,
      reliability: 0,
      impactLabel: 'Recrutement bloqué',
      description: 'Conçoit l\'offre packagée et le pricing dès l\'embauche.',
      progress: 0,
      state: 'locked',
      workspaceId: null,
      homeWorkspaceId: 'desk-offer',
      unlockCost: 400,
      spriteSeed: 4,
      order: 3,
      accessory: 'silhouette',
      emote: null,
    },
    {
      id: 'growthOperator',
      name: 'Opérateur Croissance',
      className: 'Pilote des canaux',
      palette: PALETTES.growthOperator!,
      themeColor: '#F97316',
      level: 1,
      reliability: 0,
      impactLabel: 'Recrutement bloqué',
      description: 'Active les boucles d\'acquisition une fois le QG agrandi.',
      progress: 0,
      state: 'locked',
      workspaceId: null,
      homeWorkspaceId: 'desk-growth',
      unlockCost: 650,
      spriteSeed: 5,
      order: 4,
      accessory: 'silhouette',
      emote: null,
    },
  ]
  return Object.fromEntries(seed.map((a) => [a.id, { ...a, taskQueue: [] }]))
}

/* ============================================================
   Mission templates (the agent-specific mission payloads)

   Each template describes the high-level shape of a "real" agent run:
   - the operational metadata used by the game loop,
   - the activity-log script that streams in the agent's "thinking",
   - a deliverable generator that produces a real Markdown/JSON output.

   When wired to a real LLM, replace the synthetic logs/deliverable with
   streaming events and a structured response. The interfaces stay the same.
   ============================================================ */

interface MissionTemplate {
  title: string
  output: string
  durationMs: number
  creditCost: number
  reward: number
  workspaceFor: (agentId: string) => string
  /** Script of log lines streamed while the agent works (text only — no timestamp). */
  activityScript: string[]
  /** Generator for the deliverable produced when the mission completes. */
  generateDeliverable: (ctx: DeliverableContext) => { markdown: string; json: Record<string, unknown> }
}

export interface DeliverableContext {
  agentName: string
  ventureName: string
  ventureSubtitle: string
}

export const MISSION_TEMPLATES: Record<string, MissionTemplate> = {
  scan: {
    title: "Scan d'opportunité",
    output: "Rapport d'opportunité",
    durationMs: 14000,
    creditCost: 8,
    reward: 80,
    workspaceFor: (agentId: string): string => (agentId === 'analyst' ? 'whiteboard' : 'computer-1'),
    activityScript: [
      'Cartographie du paysage concurrentiel via SimilarWeb…',
      'Analyse comparée : snyk.io, mintlify.com, vanta.com…',
      'Détection d\'un pain point récurrent dans les avis clients : intégration lente.',
      'Croisement avec les requêtes "AI audit" sur Reddit et Hacker News…',
      'Synthèse des verticaux à plus fort différentiel.',
    ],
    generateDeliverable: ({ agentName, ventureName, ventureSubtitle }) => ({
      markdown: `# Rapport d'opportunité — ${ventureName}
_Généré par ${agentName} · ${new Date().toLocaleDateString('fr-FR')}_

## TL;DR
${ventureSubtitle} adresse un pain non résolu : la lenteur d'intégration des outils d'audit AI dans les stacks SaaS B2B. Trois segments présentent un différentiel exploitable.

## Segments prioritaires
1. **Startups séries A/B (50–200 employés)** — équipes produit pressées, budget validé, churn évitable.
2. **ScaleUps SaaS RGPD/SOC2** — contrainte de conformité, valeur perçue forte d'un rapport d'audit.
3. **Cabinets de conseil tech** — revente de l'audit auprès de leurs clients (effet d'échelle).

## Différentiel
- Time-to-value < 2 jours (vs 2–3 semaines chez les concurrents).
- Rapport "AI-visibility" exploitable sans data team.
- Pricing transparent à l'audit, sans seat license.

## Pain validé
> "Notre audit a pris 6 semaines, on a perdu deux deals entre temps."
> — verbatim utilisateur Reddit r/devops, 12 sources

## Risques
- Marché éduqué mais saturé en messaging générique.
- Cycle de vente B2B requiert un POV (proof-of-value) court.

## Prochain pas
Construire un brief de positionnement focalisé sur le segment 1.`,
      json: {
        venture: ventureName,
        segments: ['SaaS séries A/B', 'ScaleUps RGPD/SOC2', 'Cabinets conseil tech'],
        differentiators: ['TTV < 2 jours', 'Sans data team', 'Pricing à l\'audit'],
        priorityScore: 82,
        recommendedNextStep: 'positioning',
      },
    }),
  },
  positioning: {
    title: 'Positionnement',
    output: 'Brief de positionnement',
    durationMs: 18000,
    creditCost: 10,
    reward: 120,
    workspaceFor: (agentId: string): string =>
      agentId === 'strategist' ? 'whiteboard' : 'brainstorm',
    activityScript: [
      'Lecture du rapport d\'opportunité…',
      'Définition de l\'ICP : Head of Engineering, 50–200 employés, scale-up SaaS B2B.',
      'Test de 4 messaging frameworks (JTBD, StoryBrand, April Dunford, Maslow B2B)…',
      'Sélection : April Dunford — focus sur le "concurrent au statu quo".',
      'Structuration de la promesse centrale et de la catégorie.',
    ],
    generateDeliverable: ({ agentName, ventureName }) => ({
      markdown: `# Brief de positionnement — ${ventureName}
_Généré par ${agentName} · ${new Date().toLocaleDateString('fr-FR')}_

## Catégorie
Nous ne sommes pas un outil d'audit générique. Nous sommes la **plateforme d'AI-visibility ops** pour scale-ups SaaS B2B.

## ICP
**Head of Engineering**, dans une scale-up de 50 à 200 employés en série A/B.
- Pression compliance (SOC 2, ISO 27001).
- Pas de data team dédiée à l'observability.
- Sensible au time-to-value, achète sur démo concrète.

## Promesse
> Visibilité complète de votre stack AI en moins de 48h, sans ralentir vos équipes.

## Alternatives & concurrents au statu quo
| Concurrent | Pourquoi nous gagnons |
| --- | --- |
| Audit interne | Trop lent, dilué |
| Snyk / Wiz | Couvre la sécurité, pas l'AI ops |
| Consulting boutique | Trop cher, livrables statiques |

## Messages clés
1. **TTV < 48h** — démo > slides.
2. **Pricing à l'audit** — pas de seat license.
3. **Rapport exploitable sans data team** — un PDF lisible par un CTO.

## Test de message
À A/B tester sur LinkedIn Ads cette semaine :
- A. "Auditez votre stack AI en 48h."
- B. "Vos LLMs en production sont une boîte noire."`,
      json: {
        category: 'AI-visibility ops',
        icp: { role: 'Head of Engineering', size: '50–200', stage: 'A/B' },
        promise: 'AI-stack visibility in <48h',
        differentiators: ['TTV 48h', 'No seat license', 'CTO-readable report'],
      },
    }),
  },
  marketing: {
    title: 'Mission Marketing',
    output: 'Plan de communication',
    durationMs: 16000,
    creditCost: 9,
    reward: 100,
    workspaceFor: () => 'brainstorm',
    activityScript: [
      'Audit des canaux d\'acquisition actifs en B2B SaaS…',
      'Analyse des CPL LinkedIn vs SEO long-tail vs partenariats…',
      'Recommandation : démarrer LinkedIn outbound + un POV gratuit ciblé.',
      'Brouillon de séquence d\'emails et hooks LinkedIn.',
      'Calibration du budget hebdomadaire.',
    ],
    generateDeliverable: ({ agentName, ventureName }) => ({
      markdown: `# Plan de communication — ${ventureName}
_Généré par ${agentName} · ${new Date().toLocaleDateString('fr-FR')}_

## Objectif 30 jours
3 appels découverte qualifiés, 1 POV signé.

## Stack canaux
| Canal | Budget hebdo | Hypothèse |
| --- | --- | --- |
| LinkedIn outbound | 4h | 80 messages, 12 réponses, 3 appels |
| Contenu LinkedIn personnel | 2h | 3 posts/semaine, growth viewer 4× |
| SEO long-tail | 1h | 1 article par 2 semaines |

## Séquence outbound (3 étapes)
**Jour 1 — Connect**
> "Bonjour {firstName}, je creuse les enjeux d'AI-visibility chez les scale-ups SaaS — votre poste m'intéresse."

**Jour 3 — POV (si accepté)**
> "On audite gratuitement la visibilité IA de 5 scale-ups ce mois. 48h, sans engagement. Ça vous tente ?"

**Jour 7 — Cas client**
> "Petit cas concret : on a aidé un Head of Eng en série B à passer de 6 sem. à 48h d'audit. Si jamais ça parle."

## KPIs
- Taux de réponse outbound > 12%
- Taux de conversion appel → POV > 25%
- Coût par appel < 35€`,
      json: {
        objective: '3 appels qualifiés / 1 POV signé en 30j',
        channels: ['LinkedIn outbound', 'LinkedIn perso', 'SEO long-tail'],
        kpis: { responseRate: 0.12, callToPov: 0.25, cpcMax: 35 },
      },
    }),
  },
  branding: {
    title: 'Kit de marque',
    output: 'Nom, accroche & ton',
    durationMs: 22000,
    creditCost: 11,
    reward: 180,
    workspaceFor: () => 'computer-2',
    activityScript: [
      'Exploration de 40 racines morphologiques (latin, grec, ancien français)…',
      'Test de disponibilité .com / .ai / EU TM…',
      'Mood-board : tons indigo profond + cyan néon + serif néo-grotesque.',
      'Brouillon des accroches A/B/C…',
      'Sélection finale du wordmark et du système typographique.',
    ],
    generateDeliverable: ({ agentName, ventureName }) => ({
      markdown: `# Kit de marque — ${ventureName}
_Généré par ${agentName} · ${new Date().toLocaleDateString('fr-FR')}_

## Wordmark
**Lumen.audit** — racine latine pour "lumière", connotation de visibilité.

## Accroche
> Voyez vos LLMs comme jamais.

## Ton de voix
- **Précis** : on cite des chiffres, jamais des superlatifs vides.
- **Direct** : pas de "leverage" ni de "synergize".
- **Confiant sans arrogance** : nous avons fait nos preuves, point.

## Système typographique
- Display : *Inter Display* — 700, tracking serré.
- Body : *Inter* — 400/500.
- Mono (data) : *JetBrains Mono*.

## Palette
| Token | Hex | Usage |
| --- | --- | --- |
| --bg-canvas | #0d0e15 | fond app |
| --accent-500 | #7B7BEC | CTA primaire |
| --cyan-500 | #22D3EE | data viz |
| --emerald-500 | #34D399 | succès |

## À éviter
- Emojis dans les CTA.
- Adjectifs "révolutionnaire", "next-gen".
- Photos stock de poignées de main.`,
      json: {
        wordmark: 'Lumen.audit',
        tagline: 'Voyez vos LLMs comme jamais.',
        palette: ['#0d0e15', '#7B7BEC', '#22D3EE', '#34D399'],
      },
    }),
  },
}

/* ============================================================
   Store
   ============================================================ */

const VENTURES_SEED: Venture[] = [
  {
    id: 'audit-visibilite',
    name: 'Audit Visibilité',
    subtitle: "Service d'audit IA pour SaaS B2B",
    industry: 'AI Ops',
    level: 1,
    levelLabel: 'Solo Builder',
    stage: 'Idée validée',
    status: 'active',
    monthlyRevenue: 0,
    agentCount: 1,
    tagline: 'Auditez votre stack AI en 48h.',
    launchedLabel: 'Lancée mars 2026',
    themeColor: '#7B7BEC',
  },
  {
    id: 'ecom-eco',
    name: 'E-com Eco',
    subtitle: 'DTC zéro-déchet — boutique éco-responsable',
    industry: 'E-commerce',
    level: 1,
    levelLabel: 'Solo Builder',
    stage: 'Idée validée',
    status: 'incubating',
    monthlyRevenue: 0,
    agentCount: 0,
    tagline: 'Le quotidien, sans plastique.',
    launchedLabel: 'En incubation',
    themeColor: '#34D399',
  },
  {
    id: 'newsletter-ia',
    name: 'Curated AI Weekly',
    subtitle: 'Newsletter B2B autonome pilotée par 4 agents',
    industry: 'Media',
    level: 1,
    levelLabel: 'Solo Builder',
    stage: 'Idée validée',
    status: 'incubating',
    monthlyRevenue: 0,
    agentCount: 0,
    tagline: 'L\'IA décryptée chaque vendredi, sans bullshit.',
    launchedLabel: 'Lancée janvier 2026',
    themeColor: '#22D3EE',
  },
]

export const useGame = create<GameState>((set, get) => ({
  ventures: Object.fromEntries(VENTURES_SEED.map((v) => [v.id, v])),
  ventureOrder: VENTURES_SEED.map((v) => v.id),
  activeVentureId: 'audit-visibilite',
  founderName: 'Jules Halluin',
  founderLevel: 4,
  founderTitle: 'Investisseur autonome',

  ventureName: 'Audit Visibilité',
  ventureSubtitle: "Service d'audit IA pour SaaS B2B",
  level: 1,
  levelLabel: 'Solo Builder',
  stage: 'Idée validée',

  xp: 0,
  credits: 300,
  reputation: 0,

  subscriptionPlan: 'Pro',
  monthlyCredits: 10000,
  creditsUsedThisMonth: 0,
  realRevenue: 0,
  activeProducts: [],
  passiveSaleLastCheckedAt: performance.now(),
  lastSaleAt: 0,
  lastSaleAmount: 0,
  systemLogLastAt: performance.now(),

  hqLevel: 1,

  agents: makeAgents(),
  agentOrder: ['strategist', 'analyst', 'brandBuilder', 'offerArchitect', 'growthOperator'],
  workspaces: Object.fromEntries(WORKSPACES.map((w) => [w.id, w])),

  missions: {},
  logs: [],
  deliverables: {},
  latestDeliverableByAgent: {},

  selectedAgentId: null,
  contextMenu: null,
  banner: null,
  drawerAgentId: null,
  openDeliverableId: null,
  showNewVentureModal: false,
  showOfflineReport: false,
  offlineReport: null,
  briefChat: null,
  briefingModal: null,

  selectAgent: (id) => set({ selectedAgentId: id }),

  openContextMenu: (agentId, screenX, screenY) =>
    set({ contextMenu: { agentId, screenX, screenY }, selectedAgentId: agentId }),
  closeContextMenu: () => set({ contextMenu: null }),

  setAgentState: (id, state) =>
    set((s) => {
      const agent = s.agents[id]
      if (!agent) return s
      return { agents: { ...s.agents, [id]: { ...agent, state } } }
    }),

  setAgentEmote: (id, emote) =>
    set((s) => {
      const agent = s.agents[id]
      if (!agent) return s
      return { agents: { ...s.agents, [id]: { ...agent, emote } } }
    }),

  startMission: (agentId, templateId, contextDeliverableId) => {
    get().enqueueMission(agentId, templateId, contextDeliverableId)
  },

  enqueueMission: (agentId, templateId, contextDeliverableId) => {
    const state = get()
    const agent = state.agents[agentId]
    if (!agent || agent.state === 'locked') return
    const template = MISSION_TEMPLATES[templateId]
    if (!template) return

    if (state.creditsUsedThisMonth + template.creditCost > state.monthlyCredits) {
      set({
        banner: {
          tone: 'warning',
          message: 'Crédits SaaS épuisés. Upgradez votre plan.',
        },
      })
      return
    }

    const busy =
      agent.state === 'working' ||
      agent.state === 'walking' ||
      agent.state === 'delivered' ||
      agent.state === 'celebrating'

    if (busy) {
      set({
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            taskQueue: [
              ...agent.taskQueue,
              { templateId: templateId as string, contextDeliverableId: contextDeliverableId ?? null },
            ],
          },
        },
        banner: {
          tone: 'info',
          message: `Mission ajoutée à la file de ${agent.name} (${agent.taskQueue.length + 1} en attente)`,
        },
      })
      return
    }

    void executeAgentMission(
      agentId,
      templateId,
      {
        ventureName: state.ventureName,
        ventureSubtitle: state.ventureSubtitle,
      },
      contextDeliverableId ?? null,
    )
  },

  tickMissions: (now) =>
    set((s) => {
      let changed = false
      const missions = { ...s.missions }
      const agents = { ...s.agents }
      for (const id of Object.keys(missions)) {
        const m = missions[id]!
        if (m.done) continue
        const elapsed = now - m.startedAt
        if (elapsed < 0) continue
        const progress = Math.min(1, elapsed / m.durationMs)
        if (progress !== m.progress) {
          missions[id] = { ...m, progress }
          changed = true
        }
        const agent = agents[m.agentId]
        if (agent && agent.state === 'walking' && elapsed > 0) {
          agents[m.agentId] = { ...agent, state: 'working', progress, emote: null }
          changed = true
        }
        if (agent && agent.state === 'working') {
          agents[m.agentId] = { ...agent, progress }
          changed = true
        }
        if (progress >= 1 && !m.done) {
          missions[id] = { ...missions[id]!, done: true, progress: 1 }
          const a = agents[m.agentId]
          if (a) {
            agents[m.agentId] = {
              ...a,
              state: 'delivered',
              progress: 1,
              emote: '!',
            }
          }
          changed = true
        }
      }

      /* Passive sales engine — fires roughly every 10s when products exist. */
      let passiveSaleLastCheckedAt = s.passiveSaleLastCheckedAt
      let realRevenue = s.realRevenue
      let banner = s.banner
      let lastSaleAt = s.lastSaleAt
      let lastSaleAmount = s.lastSaleAmount
      const SALE_INTERVAL_MS = 10000
      const due = now - s.passiveSaleLastCheckedAt >= SALE_INTERVAL_MS
      const eligibleProducts = s.activeProducts.filter(
        (p) => p.ventureId === s.activeVentureId,
      )
      if (due && eligibleProducts.length > 0) {
        passiveSaleLastCheckedAt = now
        const probability = Math.min(0.85, 0.25 + 0.12 * eligibleProducts.length)
        if (Math.random() < probability) {
          const product =
            eligibleProducts[Math.floor(Math.random() * eligibleProducts.length)]!
          const reward = product.price
          realRevenue = realRevenue + reward
          lastSaleAt = now
          lastSaleAmount = reward
          banner = product.synergyBonus
            ? {
                tone: 'success',
                message: `[Vente Synergique] Un client a acheté votre service bonifié · +${reward}€`,
              }
            : {
                tone: 'success',
                message: `Vente passive — ${product.title} · +${reward}€`,
              }
          changed = true
          queueMicrotask(() => {
            useGame
              .getState()
              .pushLog(
                product.agentId,
                product.synergyBonus
                  ? `[Vente Synergique] ${product.title} acheté · +${reward}€`
                  : `Vente passive · ${product.title} · +${reward}€`,
              )
            useGame
              .getState()
              .pushSystemLog(
                'ROUTER',
                `HTTP POST /api/v1/checkout — 200 OK · order_${product.id.slice(-6)} · ${reward}€`,
              )
          })
        } else {
          changed = true
        }
      }

      /* System / infra log stream — only when there's signal worth narrating. */
      let systemLogLastAt = s.systemLogLastAt
      const hasActiveProducts = eligibleProducts.length > 0
      const hasWorkingAgent = Object.values(s.agents).some(
        (a) => a.state === 'working' || a.state === 'walking',
      )
      const SYSTEM_LOG_MIN_MS = 5000
      const SYSTEM_LOG_MAX_MS = 10000
      if (hasActiveProducts || hasWorkingAgent) {
        const sinceLast = now - s.systemLogLastAt
        if (sinceLast >= SYSTEM_LOG_MIN_MS) {
          const rollWindow = SYSTEM_LOG_MAX_MS - SYSTEM_LOG_MIN_MS
          const ratio = Math.min(1, (sinceLast - SYSTEM_LOG_MIN_MS) / rollWindow)
          if (Math.random() < 0.25 + ratio * 0.55) {
            systemLogLastAt = now
            queueMicrotask(() => {
              const entry = pickSystemLogEntry(
                hasActiveProducts,
                hasWorkingAgent,
              )
              useGame.getState().pushSystemLog(entry.channel, entry.message)
            })
            changed = true
          }
        }
      }

      if (!changed) return s
      return {
        missions,
        agents,
        passiveSaleLastCheckedAt,
        realRevenue,
        banner,
        lastSaleAt,
        lastSaleAmount,
        systemLogLastAt,
      }
    }),

  completeMission: (agentId) => {
    const state = get()
    const agent = state.agents[agentId]
    if (!agent || agent.state !== 'delivered') return
    const mission = state.missions[agentId]
    const baseReward = mission?.reward ?? 120
    const nextMissions = { ...state.missions }
    delete nextMissions[agentId]
    const deliverableId = state.latestDeliverableByAgent[agentId] ?? null
    const deliverable = deliverableId ? state.deliverables[deliverableId] : null
    const synergyBonus = Boolean(deliverable?.parentDeliverableId)
    const finalPrice = synergyBonus ? Math.round(baseReward * 1.3) : baseReward
    const archivedProduct: ActiveProduct = {
      id: `product-${agentId}-${Date.now()}`,
      ventureId: state.activeVentureId,
      deliverableId,
      agentId,
      agentName: agent.name,
      title: mission?.output ?? 'Service Autars',
      price: finalPrice,
      basePrice: baseReward,
      synergyBonus,
      createdAt: Date.now(),
      status: 'active',
    }
    set({
      agents: {
        ...state.agents,
        [agentId]: {
          ...agent,
          state: 'celebrating',
          workspaceId: agent.homeWorkspaceId,
          progress: 0,
          emote: '✓',
        },
      },
      missions: nextMissions,
      activeProducts: [...state.activeProducts, archivedProduct],
      xp: state.xp + Math.round(finalPrice / 4),
      reputation: Math.min(100, state.reputation + 4),
      banner: synergyBonus
        ? { tone: 'success', message: `Livrable synergique archivé · +30% (${finalPrice}€)` }
        : { tone: 'success', message: 'Livrable prêt et archivé' },
      openDeliverableId: deliverableId,
    })
    useGame
      .getState()
      .pushLog(
        agentId,
        synergyBonus
          ? `Livrable synergique archivé — prix bonifié ${finalPrice}€`
          : 'Livrable prêt et archivé dans le marché',
      )
    // Return to idle (or auto-chain the next queued mission) after a short celebration.
    setTimeout(() => {
      const s2 = get()
      const a2 = s2.agents[agentId]
      if (!a2 || a2.state !== 'celebrating') return

      if (a2.taskQueue.length > 0) {
        const [nextTask, ...rest] = a2.taskQueue
        set({
          agents: {
            ...s2.agents,
            [agentId]: { ...a2, state: 'idle', emote: null, taskQueue: rest },
          },
        })
        void executeAgentMission(
          agentId,
          nextTask!.templateId as keyof typeof MISSION_TEMPLATES,
          {
            ventureName: s2.ventureName,
            ventureSubtitle: s2.ventureSubtitle,
          },
          nextTask!.contextDeliverableId ?? null,
        )
        return
      }

      set({
        agents: {
          ...s2.agents,
          [agentId]: { ...a2, state: 'idle', emote: null },
        },
      })
    }, 2400)
  },

  unlockAgent: (id) =>
    set((s) => {
      const agent = s.agents[id]
      if (!agent || agent.state !== 'locked') return s
      const cost = agent.unlockCost ?? 0
      if (s.credits < cost) {
        return {
          banner: {
            tone: 'warning',
            message: `Il manque ${cost - s.credits} crédits pour recruter ${agent.name}`,
          },
        }
      }
      return {
        credits: s.credits - cost,
        agents: {
          ...s.agents,
          [id]: {
            ...agent,
            state: 'idle',
            workspaceId: agent.homeWorkspaceId,
            level: 1,
            reliability: 70,
            impactLabel: 'Nouvelle recrue',
            emote: '✓',
          },
        },
        banner: { tone: 'success', message: `${agent.name} rejoint l'équipe !` },
      }
    }),

  upgradeHQ: () =>
    set((s) => {
      const cost = 200 + s.hqLevel * 150
      if (s.credits < cost) {
        return {
          banner: {
            tone: 'warning',
            message: `Il manque ${cost - s.credits} crédits pour agrandir le QG`,
          },
        }
      }
      return {
        credits: s.credits - cost,
        hqLevel: s.hqLevel + 1,
        monthlyCredits: s.monthlyCredits + 2500,
        banner: { tone: 'success', message: `QG amélioré (Niv. ${s.hqLevel + 1})` },
      }
    }),

  setBanner: (banner) => set({ banner }),

  pushLog: (agentId, message) => {
    const agent = get().agents[agentId]
    if (!agent) return
    set((s) => ({
      logs: [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ts: Date.now(),
          agentId,
          agentName: agent.name,
          message,
        },
        ...s.logs,
      ].slice(0, 100),
    }))
  },

  pushSystemLog: (channel, message) => {
    set((s) => ({
      logs: [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ts: Date.now(),
          agentId: `__${channel.toLowerCase()}`,
          agentName: channel,
          message,
        },
        ...s.logs,
      ].slice(0, 100),
    }))
  },

  openAgentDrawer: (id) => set({ drawerAgentId: id }),
  openDeliverable: (id) => set({ openDeliverableId: id }),

  openNewVentureModal: () => set({ showNewVentureModal: true }),
  closeNewVentureModal: () => set({ showNewVentureModal: false }),

  setActiveVenture: (id) =>
    set((s) => {
      const v = s.ventures[id]
      if (!v) return s
      return {
        activeVentureId: id,
        ventureName: v.name,
        ventureSubtitle: v.subtitle,
        level: v.level,
        levelLabel: v.levelLabel,
        stage: v.stage,
        passiveSaleLastCheckedAt: performance.now(),
      }
    }),

  createVenture: (data) => {
    const slug = data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    const id = `${slug || 'venture'}-${Date.now().toString(36)}`
    const themePool = ['#7B7BEC', '#22D3EE', '#34D399', '#F97316', '#C084FC', '#FBBF24']
    const themeColor = themePool[Math.floor(Math.random() * themePool.length)]!
    const newVenture: Venture = {
      id,
      name: data.name,
      subtitle: data.subtitle,
      industry: data.industry,
      level: 1,
      levelLabel: 'Solo Builder',
      stage: 'Idée validée',
      status: 'active',
      monthlyRevenue: 0,
      agentCount: 1,
      tagline: data.subtitle,
      launchedLabel: `Lancée ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
      themeColor,
    }

    const freshAgents = makeAgents()
    const starterId = data.starterAgentId
    for (const aId of Object.keys(freshAgents)) {
      const a = freshAgents[aId]!
      if (aId === starterId) {
        freshAgents[aId] = {
          ...a,
          state: 'idle',
          workspaceId: a.homeWorkspaceId,
          progress: 0,
          emote: null,
          level: 1,
          reliability: 70,
          impactLabel: 'Nouvelle recrue',
          unlockCost: undefined,
        }
      } else {
        freshAgents[aId] = {
          ...a,
          state: 'locked',
          workspaceId: null,
          progress: 0,
          emote: null,
          unlockCost: a.unlockCost ?? 250,
        }
      }
    }

    set((s) => ({
      ventures: { ...s.ventures, [id]: newVenture },
      ventureOrder: [...s.ventureOrder, id],
      activeVentureId: id,
      ventureName: newVenture.name,
      ventureSubtitle: newVenture.subtitle,
      level: newVenture.level,
      levelLabel: newVenture.levelLabel,
      stage: newVenture.stage,
      agents: freshAgents,
      missions: {},
      logs: [],
      deliverables: {},
      latestDeliverableByAgent: {},
      passiveSaleLastCheckedAt: performance.now(),
      selectedAgentId: starterId,
      showNewVentureModal: false,
      banner: {
        tone: 'success',
        message: `${newVenture.name} créée — bienvenue dans votre nouveau QG.`,
      },
    }))

    return id
  },

  closeOfflineReport: () => set({ showOfflineReport: false }),
  collectOfflineReport: () => {
    const s = get()
    const report = s.offlineReport
    if (!report) {
      set({ showOfflineReport: false })
      return
    }
    set({
      realRevenue: s.realRevenue + report.revenueGenerated,
      creditsUsedThisMonth: Math.min(
        s.monthlyCredits,
        s.creditsUsedThisMonth + report.creditsSpent,
      ),
      showOfflineReport: false,
      banner: {
        tone: 'success',
        message: `Livrables récoltés · +${report.revenueGenerated}€`,
      },
    })
  },

  openBriefChat: (missionKey, contextDeliverableId) => {
    const s = get()
    const meta = MISSION_META[missionKey]
    if (!meta) return
    const agent = s.agents[meta.agentId]
    if (!agent || agent.state === 'locked') {
      set({
        banner: {
          tone: 'warning',
          message: `${meta.agentId} non disponible — recrute-le d'abord.`,
        },
      })
      return
    }
    set({
      briefChat: {
        missionKey,
        agentId: meta.agentId,
        ventureId: s.activeVentureId,
        messages: [],
        status: 'briefing',
        contextDeliverableId: contextDeliverableId ?? null,
      },
      contextMenu: null,
      briefingModal: null,
    })
    if (contextDeliverableId) {
      const d = s.deliverables[contextDeliverableId]
      if (d) {
        get().pushLog(meta.agentId, `[Système] : Chargement du contexte ${d.missionTitle}...`)
      }
    }
    void streamBriefAssistantTurn()
  },

  openBriefingModal: (payload) =>
    set({
      briefingModal: {
        ...payload,
        missionKey: 'missionKey' in payload ? payload.missionKey : undefined,
        missionTemplateId:
          'missionTemplateId' in payload ? payload.missionTemplateId : undefined,
      },
      contextMenu: null,
    }),
  closeBriefingModal: () => set({ briefingModal: null }),
  confirmBriefingModal: (contextDeliverableId) => {
    const s = get()
    const m = s.briefingModal
    if (!m) return
    set({ briefingModal: null })
    if (m.mode === 'live' && m.missionKey) {
      get().openBriefChat(m.missionKey, contextDeliverableId)
    } else if (m.mode === 'enqueue' && m.missionTemplateId) {
      get().enqueueMission(
        m.agentId,
        m.missionTemplateId as keyof typeof MISSION_TEMPLATES,
        contextDeliverableId,
      )
    }
  },

  closeBriefChat: () => set({ briefChat: null }),

  sendBriefUserMessage: async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const s = get()
    const chat = s.briefChat
    if (!chat || chat.status === 'streaming' || chat.status === 'running') return
    set({
      briefChat: {
        ...chat,
        messages: [...chat.messages, { role: 'user', content: trimmed }],
        status: 'briefing',
      },
    })
    await streamBriefAssistantTurn()
  },

  runRealMission: async () => {
    const s = get()
    const chat = s.briefChat
    if (!chat) return
    const agent = s.agents[chat.agentId]
    if (!agent) return
    const meta = MISSION_META[chat.missionKey]

    const venture: VentureContext = {
      name: s.ventureName,
      subtitle: s.ventureSubtitle,
      industry: s.ventures[s.activeVentureId]?.industry ?? 'Inconnu',
    }

    const missionId = `mission-${agent.id}-${Date.now()}`
    set({
      briefChat: { ...chat, status: 'running' },
      agents: {
        ...s.agents,
        [agent.id]: {
          ...agent,
          state: 'working',
          workspaceId: meta.workspace,
          progress: 0,
          emote: null,
        },
      },
      missions: {
        ...s.missions,
        [agent.id]: {
          id: missionId,
          agentId: agent.id,
          title: meta.title,
          output: meta.output,
          templateId: chat.missionKey,
          durationMs: 30000,
          creditCost: 0,
          reward: 0,
          startedAt: performance.now(),
          progress: 0.05,
          done: false,
          contextDeliverableId: chat.contextDeliverableId ?? null,
        },
      },
      banner: {
        tone: 'info',
        message: `${agent.name} lance ${meta.output.toLowerCase()} — streaming`,
      },
    })

    if (chat.contextDeliverableId) {
      const parent = s.deliverables[chat.contextDeliverableId]
      if (parent) {
        get().pushLog(
          agent.id,
          `[Système] : Transmission du livrable précédent à ${agent.name}...`,
        )
        get().pushLog(
          agent.id,
          `[Système] : Contexte chargé · ${parent.missionTitle} (par ${parent.agentName})`,
        )
      }
    }
    get().pushLog(agent.id, `Mission lancée : ${meta.title}`)

    let markdown = ''
    let buffer = ''
    let bumpTimer: ReturnType<typeof setInterval> | null = null
    try {
      bumpTimer = setInterval(() => {
        const m = useGame.getState().missions[agent.id]
        if (!m || m.id !== missionId) return
        const next = Math.min(0.92, m.progress + 0.02)
        useGame.setState((st) => ({
          missions: { ...st.missions, [agent.id]: { ...m, progress: next } },
          agents: {
            ...st.agents,
            [agent.id]: { ...st.agents[agent.id]!, progress: next },
          },
        }))
      }, 800)

      for await (const ev of streamMission(chat.missionKey, venture, chat.messages)) {
        if (ev.type === 'tool') {
          get().pushLog(agent.id, `[outil] ${ev.name ?? 'web_search'} appelé…`)
          continue
        }
        if (ev.type === 'tool_result') {
          get().pushLog(agent.id, `[outil] résultats reçus`)
          continue
        }
        if (ev.type !== 'delta' || !ev.text) continue
        markdown += ev.text
        buffer += ev.text
        const newlineIdx = buffer.lastIndexOf('\n')
        if (newlineIdx >= 0) {
          const ready = buffer.slice(0, newlineIdx)
          buffer = buffer.slice(newlineIdx + 1)
          for (const line of ready.split('\n')) {
            const t = line.trim()
            if (t.length > 2) get().pushLog(agent.id, t.slice(0, 140))
          }
        }
      }
      if (buffer.trim().length > 2) {
        get().pushLog(agent.id, buffer.trim().slice(0, 140))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur LLM inconnue'
      set({
        briefChat: { ...get().briefChat!, status: 'error', error: msg },
        banner: { tone: 'warning', message: `Scan interrompu : ${msg}` },
      })
      const sNow = useGame.getState()
      const agentNow = sNow.agents[agent.id]
      if (agentNow) {
        useGame.setState({
          agents: {
            ...sNow.agents,
            [agent.id]: { ...agentNow, state: 'idle', progress: 0, emote: '!' },
          },
        })
      }
      return
    } finally {
      if (bumpTimer) clearInterval(bumpTimer)
    }

    const deliverableId = `deliverable-${missionId}`
    const deliverable: MissionDeliverable = {
      id: deliverableId,
      agentId: agent.id,
      agentName: agent.name,
      missionTitle: meta.output,
      generatedAt: Date.now(),
      markdown,
      json: {
        source: 'claude-opus-4-7',
        missionKey: chat.missionKey,
        briefTurns: chat.messages.length,
      },
      parentDeliverableId: chat.contextDeliverableId ?? null,
    }

    useGame.setState((st) => {
      const agentNow = st.agents[agent.id]!
      const mNow = st.missions[agent.id]
      return {
        deliverables: { ...st.deliverables, [deliverableId]: deliverable },
        latestDeliverableByAgent: {
          ...st.latestDeliverableByAgent,
          [agent.id]: deliverableId,
        },
        missions: mNow
          ? { ...st.missions, [agent.id]: { ...mNow, progress: 1, done: true } }
          : st.missions,
        agents: {
          ...st.agents,
          [agent.id]: { ...agentNow, state: 'delivered', progress: 1, emote: '!' },
        },
        briefChat: null,
        banner: {
          tone: 'success',
          message: `${meta.output} prêt — valide le livrable`,
        },
      }
    })

    get().pushLog(agent.id, `Livrable généré : ${meta.output}`)
  },
}))

/* ============================================================
   System / infra log entries — picked randomly to flavour the
   activity console with realistic DevOps chatter.
   ============================================================ */

interface SystemLogEntry {
  channel: 'SYSTEM' | 'ROUTER' | 'DATABASE'
  message: string
}

const SYSTEM_LOG_POOL_ACTIVE: SystemLogEntry[] = [
  { channel: 'SYSTEM', message: 'Outbound Campaign: Scanned 12 new prospects on LinkedIn.' },
  { channel: 'ROUTER', message: 'HTTP GET /api/v1/landing — 200 OK from User_7421 (Agent_IA)' },
  { channel: 'ROUTER', message: 'HTTP GET /assets/og-card.png — 200 OK · cache HIT' },
  { channel: 'DATABASE', message: 'Context vectorized and cached successfully.' },
  { channel: 'DATABASE', message: 'pgvector index refreshed · 1842 embeddings · 84ms' },
  { channel: 'SYSTEM', message: 'Healthcheck OK · web-1, web-2, db-primary nominal.' },
  { channel: 'SYSTEM', message: 'Background job · enrich_prospect(batch=24) succeeded.' },
]

const SYSTEM_LOG_POOL_WORKING: SystemLogEntry[] = [
  { channel: 'DATABASE', message: 'Snapshot agent context · 4.2MB → S3://autars-runs/' },
  { channel: 'SYSTEM', message: 'Token usage · 18.4k in / 6.1k out · cost €0.041' },
  { channel: 'ROUTER', message: 'HTTP POST /api/v1/llm/stream — 200 streaming…' },
]

function pickSystemLogEntry(
  hasActiveProducts: boolean,
  hasWorkingAgent: boolean,
): SystemLogEntry {
  const pool: SystemLogEntry[] = []
  if (hasActiveProducts) pool.push(...SYSTEM_LOG_POOL_ACTIVE)
  if (hasWorkingAgent) pool.push(...SYSTEM_LOG_POOL_WORKING)
  if (pool.length === 0) pool.push(...SYSTEM_LOG_POOL_ACTIVE)
  return pool[Math.floor(Math.random() * pool.length)]!
}

async function streamBriefAssistantTurn() {
  const s = useGame.getState()
  const chat = s.briefChat
  if (!chat) return
  const venture: VentureContext = {
    name: s.ventureName,
    subtitle: s.ventureSubtitle,
    industry: s.ventures[s.activeVentureId]?.industry ?? 'Inconnu',
  }
  const missionKey = chat.missionKey
  useGame.setState({
    briefChat: {
      ...chat,
      status: 'streaming',
      messages: [...chat.messages, { role: 'assistant', content: '' }],
    },
  })

  let acc = ''
  try {
    for await (const chunk of streamBriefTurn(missionKey, venture, chat.messages)) {
      acc += chunk
      useGame.setState((st) => {
        const c = st.briefChat
        if (!c) return st
        const msgs = c.messages.slice()
        msgs[msgs.length - 1] = { role: 'assistant', content: acc }
        return { briefChat: { ...c, messages: msgs } }
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur LLM inconnue'
    useGame.setState((st) => {
      const c = st.briefChat
      if (!c) return st
      return { briefChat: { ...c, status: 'error', error: msg } }
    })
    return
  }

  const ready = acc.includes('BRIEF_READY')
  useGame.setState((st) => {
    const c = st.briefChat
    if (!c) return st
    return { briefChat: { ...c, status: ready ? 'ready' : 'briefing' } }
  })
}

/* ============================================================
   executeAgentMission

   Orchestrates the full lifecycle of an agent run. Designed to be the
   single integration point for a real LLM backend later — replace the
   setTimeout-driven script with a streamed response and the rest of the
   game loop (logs, deliverable, energy) keeps working unchanged.
   ============================================================ */

export function executeAgentMission(
  agentId: string,
  templateId: keyof typeof MISSION_TEMPLATES,
  context: { ventureName: string; ventureSubtitle: string },
  contextDeliverableId: string | null = null,
) {
  const store = useGame.getState()
  const agent = store.agents[agentId]
  if (!agent || agent.state === 'locked') return
  const template = MISSION_TEMPLATES[templateId]
  if (!template) return
  if (store.creditsUsedThisMonth + template.creditCost > store.monthlyCredits) {
    useGame.setState({
      banner: {
        tone: 'warning',
        message: 'Crédits SaaS épuisés. Upgradez votre plan.',
      },
    })
    return
  }

  const missionId = `mission-${agentId}-${Date.now()}`
  const wsId = template.workspaceFor(agentId)
  const startedAt = performance.now() + 1200
  const ctxDeliverable = contextDeliverableId
    ? store.deliverables[contextDeliverableId] ?? null
    : null

  useGame.setState({
    creditsUsedThisMonth: store.creditsUsedThisMonth + template.creditCost,
    agents: {
      ...store.agents,
      [agentId]: {
        ...agent,
        state: 'walking',
        workspaceId: wsId,
        progress: 0,
        emote: '?',
      },
    },
    missions: {
      ...store.missions,
      [agentId]: {
        id: missionId,
        agentId,
        title: template.title,
        output: template.output,
        templateId,
        durationMs: template.durationMs,
        creditCost: template.creditCost,
        reward: template.reward,
        startedAt,
        progress: 0,
        done: false,
        contextDeliverableId: contextDeliverableId ?? null,
      },
    },
    contextMenu: null,
    banner: { tone: 'info', message: `${agent.name} démarre "${template.title}"` },
  })

  if (ctxDeliverable) {
    useGame
      .getState()
      .pushLog(
        agentId,
        `[Système] : Transmission du livrable précédent à ${agent.name}...`,
      )
    useGame
      .getState()
      .pushLog(
        agentId,
        `[Système] : Contexte chargé · ${ctxDeliverable.missionTitle} (par ${ctxDeliverable.agentName})`,
      )
  }
  useGame.getState().pushLog(agentId, `Mission lancée : ${template.title}`)

  // Schedule the activity script so it streams while the mission runs.
  // This is the seam to replace with a real LLM streaming endpoint:
  //   for await (const chunk of streamLlm(prompt)) pushLog(agentId, chunk)
  const totalSteps = template.activityScript.length
  template.activityScript.forEach((line, i) => {
    const delay = 1200 + ((i + 1) / (totalSteps + 1)) * template.durationMs
    setTimeout(() => {
      const m = useGame.getState().missions[agentId]
      if (!m || m.id !== missionId) return // mission was cancelled / replaced
      useGame.getState().pushLog(agentId, line)
    }, delay)
  })

  // Schedule the deliverable generation slightly after mission completion.
  setTimeout(() => {
    const m = useGame.getState().missions[agentId]
    if (!m || m.id !== missionId) return
    const ctx: DeliverableContext = {
      agentName: agent.name,
      ventureName: context.ventureName,
      ventureSubtitle: context.ventureSubtitle,
    }
    const generated = template.generateDeliverable(ctx)
    const deliverableId = `deliverable-${missionId}`
    const deliverable: MissionDeliverable = {
      id: deliverableId,
      agentId,
      agentName: agent.name,
      missionTitle: template.title,
      generatedAt: Date.now(),
      markdown: generated.markdown,
      json: generated.json,
      parentDeliverableId: contextDeliverableId ?? null,
    }
    useGame.setState((s) => ({
      deliverables: { ...s.deliverables, [deliverableId]: deliverable },
      latestDeliverableByAgent: { ...s.latestDeliverableByAgent, [agentId]: deliverableId },
    }))
    useGame.getState().pushLog(agentId, `Livrable généré : ${template.output}`)
  }, 1200 + template.durationMs + 200)
}

/* ============================================================
   Backend context bridge

   Returns a Markdown block ready to prepend to a mission prompt when a
   prior deliverable is used as context. Returns null when no parent
   deliverable is attached. The backend handler can call this through the
   exposed selector to enrich the system prompt.
   ============================================================ */

export function buildMissionPromptContext(deliverableId: string | null | undefined): string | null {
  if (!deliverableId) return null
  const d = useGame.getState().deliverables[deliverableId]
  if (!d) return null
  return [
    `## Contexte transmis par l'agent précédent`,
    `_${d.missionTitle} — produit par ${d.agentName} le ${new Date(
      d.generatedAt,
    ).toLocaleString('fr-FR')}_`,
    '',
    d.markdown.trim(),
  ].join('\n')
}

/* ============================================================
   Selectors
   ============================================================ */

export const selectAgentsArray = (s: GameState) =>
  s.agentOrder.map((id) => s.agents[id]).filter(Boolean) as AgentRuntime[]
export const selectWorkingAgents = (s: GameState) =>
  selectAgentsArray(s).filter((a) => a.state === 'working' || a.state === 'walking')
