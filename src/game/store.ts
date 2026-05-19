import { create } from 'zustand'

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
  /** Pending mission template ids queued behind the active mission. */
  taskQueue: string[]
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
  /** Real revenue (€) generated on completion. */
  reward: number
  /** Started at timestamp (performance.now). */
  startedAt: number
  /** Cached progress (0..1). */
  progress: number
  done: boolean
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

  /* Actions */
  selectAgent: (id: string | null) => void
  openContextMenu: (agentId: string, x: number, y: number) => void
  closeContextMenu: () => void
  setAgentState: (id: string, state: AgentLifeState) => void
  setAgentEmote: (id: string, emote: string | null) => void
  startMission: (agentId: string, missionTemplateId: keyof typeof MISSION_TEMPLATES) => void
  enqueueMission: (agentId: string, missionTemplateId: keyof typeof MISSION_TEMPLATES) => void
  completeMission: (agentId: string) => void
  unlockAgent: (id: string) => void
  upgradeHQ: () => void
  tickMissions: (now: number) => void
  setBanner: (banner: { tone: 'info' | 'success' | 'warning'; message: string } | null) => void
  pushLog: (agentId: string, message: string) => void
  openAgentDrawer: (id: string | null) => void
  openDeliverable: (id: string | null) => void
  closeOfflineReport: () => void
  collectOfflineReport: () => void
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
      level: 3,
      reliability: 84,
      impactLabel: '+15% impact',
      description: 'Cartographie le marché et la promesse centrale du projet.',
      progress: 0.52,
      state: 'working',
      workspaceId: 'computer-1',
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
      level: 2,
      reliability: 78,
      impactLabel: '+9% maturité',
      description: 'Croise données marché et signaux pour valider les hypothèses.',
      progress: 1,
      state: 'delivered',
      workspaceId: 'whiteboard',
      homeWorkspaceId: 'desk-analyst',
      spriteSeed: 2,
      order: 1,
      accessory: 'cheveux turquoise',
      emote: '!',
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
    level: 2,
    levelLabel: 'Micro-entreprise IA',
    stage: 'Opportunité validée',
    status: 'active',
    monthlyRevenue: 1840,
    agentCount: 2,
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
    level: 3,
    levelLabel: 'Équipe automatisée',
    stage: 'Acquisition active',
    status: 'active',
    monthlyRevenue: 6420,
    agentCount: 4,
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
  level: 2,
  levelLabel: 'Micro-entreprise IA',
  stage: 'Opportunité validée',

  xp: 120,
  credits: 180,
  reputation: 38,

  subscriptionPlan: 'Pro',
  monthlyCredits: 10000,
  creditsUsedThisMonth: 1450,
  realRevenue: 240,

  hqLevel: 2,

  agents: makeAgents(),
  agentOrder: ['strategist', 'analyst', 'brandBuilder', 'offerArchitect', 'growthOperator'],
  workspaces: Object.fromEntries(WORKSPACES.map((w) => [w.id, w])),

  /* Seed an in-flight mission for the strategist so the simulation feels alive. */
  missions: {
    strategist: {
      id: 'seed-strategist',
      agentId: 'strategist',
      title: "Scan d'opportunité",
      output: "Rapport d'opportunité",
      templateId: 'scan',
      // 52% complete already; the rest plays out live.
      durationMs: 30000,
      creditCost: 0,
      reward: 140,
      startedAt: performance.now() - 30000 * 0.52,
      progress: 0.52,
      done: false,
    },
  },

  logs: [
    {
      id: 'log-seed-1',
      ts: Date.now() - 6000,
      agentId: 'strategist',
      agentName: 'Stratège',
      message: 'Cartographie du paysage concurrentiel via SimilarWeb…',
    },
    {
      id: 'log-seed-2',
      ts: Date.now() - 4000,
      agentId: 'strategist',
      agentName: 'Stratège',
      message: 'Analyse comparée : snyk.io, mintlify.com, vanta.com…',
    },
    {
      id: 'log-seed-3',
      ts: Date.now() - 2000,
      agentId: 'analyst',
      agentName: 'Analyste Marché',
      message: 'Livrable structuré et archivé.',
    },
  ],
  deliverables: {
    'deliverable-seed-analyst': {
      id: 'deliverable-seed-analyst',
      agentId: 'analyst',
      agentName: 'Analyste Marché',
      missionTitle: "Scan d'opportunité",
      generatedAt: Date.now() - 1000,
      markdown: `# Rapport d'opportunité — Audit Visibilité
_Généré par Analyste Marché_

## TL;DR
Service d'audit IA pour SaaS B2B adresse un pain non résolu : la lenteur d'intégration des outils d'audit AI dans les stacks SaaS B2B.

## Top segments
1. **Startups séries A/B (50–200 employés)**
2. **ScaleUps SaaS RGPD/SOC2**
3. **Cabinets de conseil tech**

## Prochain pas
Lancer la mission de positionnement.`,
      json: {
        venture: 'Audit Visibilité',
        priorityScore: 82,
        recommendedNextStep: 'positioning',
      },
    },
  },
  latestDeliverableByAgent: {
    analyst: 'deliverable-seed-analyst',
  },

  selectedAgentId: 'strategist',
  contextMenu: null,
  banner: null,
  drawerAgentId: null,
  openDeliverableId: null,
  showOfflineReport: true,
  offlineReport: {
    agentId: 'analyst',
    agentName: 'Analyste Marché',
    tasksCompleted: 3,
    creditsSpent: 150,
    revenueGenerated: 320,
    deliverableTitles: [
      "Scan d'opportunité — segment SaaS B2B",
      'Brief de positionnement — Lumen.audit',
      "Plan d'attaque LinkedIn outbound",
    ],
  },

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

  startMission: (agentId, templateId) => {
    get().enqueueMission(agentId, templateId)
  },

  enqueueMission: (agentId, templateId) => {
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
          [agentId]: { ...agent, taskQueue: [...agent.taskQueue, templateId as string] },
        },
        banner: {
          tone: 'info',
          message: `Mission ajoutée à la file de ${agent.name} (${agent.taskQueue.length + 1} en attente)`,
        },
      })
      return
    }

    void executeAgentMission(agentId, templateId, {
      ventureName: state.ventureName,
      ventureSubtitle: state.ventureSubtitle,
    })
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
      if (!changed) return s
      return { missions, agents }
    }),

  completeMission: (agentId) => {
    const state = get()
    const agent = state.agents[agentId]
    if (!agent || agent.state !== 'delivered') return
    const mission = state.missions[agentId]
    const reward = mission?.reward ?? 120
    const nextMissions = { ...state.missions }
    delete nextMissions[agentId]
    const deliverableId = state.latestDeliverableByAgent[agentId] ?? null
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
      realRevenue: state.realRevenue + reward,
      xp: state.xp + Math.round(reward / 4),
      reputation: Math.min(100, state.reputation + 4),
      banner: { tone: 'success', message: `Livrable vendu · +${reward}€` },
      openDeliverableId: deliverableId,
    })
    useGame.getState().pushLog(agentId, `Livrable validé — +${reward}€ revenus réels`)
    // Return to idle (or auto-chain the next queued mission) after a short celebration.
    setTimeout(() => {
      const s2 = get()
      const a2 = s2.agents[agentId]
      if (!a2 || a2.state !== 'celebrating') return

      if (a2.taskQueue.length > 0) {
        const [nextTemplateId, ...rest] = a2.taskQueue
        set({
          agents: {
            ...s2.agents,
            [agentId]: { ...a2, state: 'idle', emote: null, taskQueue: rest },
          },
        })
        void executeAgentMission(agentId, nextTemplateId as keyof typeof MISSION_TEMPLATES, {
          ventureName: s2.ventureName,
          ventureSubtitle: s2.ventureSubtitle,
        })
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
        banner: { tone: 'success', message: `${agent.name} rejoint l\'équipe !` },
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

  openAgentDrawer: (id) => set({ drawerAgentId: id }),
  openDeliverable: (id) => set({ openDeliverableId: id }),

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
}))

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
      },
    },
    contextMenu: null,
    banner: { tone: 'info', message: `${agent.name} démarre "${template.title}"` },
  })

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
    }
    useGame.setState((s) => ({
      deliverables: { ...s.deliverables, [deliverableId]: deliverable },
      latestDeliverableByAgent: { ...s.latestDeliverableByAgent, [agentId]: deliverableId },
    }))
    useGame.getState().pushLog(agentId, `Livrable généré : ${template.output}`)
  }, 1200 + template.durationMs + 200)
}

/* ============================================================
   Selectors
   ============================================================ */

export const selectAgentsArray = (s: GameState) =>
  s.agentOrder.map((id) => s.agents[id]).filter(Boolean) as AgentRuntime[]
export const selectWorkingAgents = (s: GameState) =>
  selectAgentsArray(s).filter((a) => a.state === 'working' || a.state === 'walking')
