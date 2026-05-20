import type { Agent, MainGoal, ProjectType } from '../lib/types'

export const projectTypes: {
  value: ProjectType
  description: string
}[] = [
  { value: 'Startup', description: 'Valider une opportunité et construire un MVP.' },
  { value: 'Freelance / indépendant', description: 'Structurer une offre et signer les premiers clients.' },
  { value: 'E-commerce', description: 'Clarifier le catalogue, la promesse et les canaux.' },
  { value: 'Agence', description: "Organiser les offres, le delivery et l'acquisition." },
  { value: 'SaaS', description: 'Prioriser le produit, la landing et la demande.' },
  { value: 'Service local', description: 'Créer une présence claire et des actions terrain.' },
  { value: 'Autre', description: 'Adapter le QG à un projet atypique.' },
]

export const mainGoals: {
  value: MainGoal
  description: string
}[] = [
  { value: 'Clarifier mon idée', description: 'Transformer une intuition en direction lisible.' },
  { value: 'Créer mon offre', description: 'Assembler promesse, cible, prix et livrables.' },
  { value: 'Trouver mes premiers clients', description: 'Prioriser les canaux et les prochaines actions.' },
  { value: 'Construire ma landing page', description: 'Créer une page claire, crédible et orientée conversion.' },
  { value: 'Automatiser mes opérations', description: 'Identifier les routines à systématiser.' },
  { value: 'Structurer mon business plan', description: 'Aligner vision, marché, modèles et exécution.' },
]

export const defaultAgents: Omit<Agent, 'projectId' | 'createdAt'>[] = [
  {
    id: 'strategist',
    name: 'Stratège',
    role: "Clarifie l'idée, le positionnement et les décisions clés.",
    status: 'actif',
    accent: '#6c6ce3',
    icon: 'compass',
    exampleMission: 'Formaliser une proposition de valeur en 5 hypothèses testables.',
  },
  {
    id: 'market-analyst',
    name: 'Analyste Marché',
    role: 'Analyse le marché, les concurrents et les opportunités.',
    status: 'en attente',
    accent: '#1aa6a6',
    icon: 'search',
    exampleMission: 'Identifier trois segments clients et leurs signaux de demande.',
  },
  {
    id: 'builder',
    name: 'Builder',
    role: 'Transforme les idées en livrables concrets.',
    status: 'travaille',
    accent: '#f29d38',
    icon: 'builder',
    exampleMission: 'Produire une première structure de landing page.',
  },
  {
    id: 'growth',
    name: 'Growth Agent',
    role: "Aide à trouver des clients et créer des actions d'acquisition.",
    status: 'actif',
    accent: '#40b77a',
    icon: 'growth',
    exampleMission: 'Définir les 5 premiers canaux à tester cette semaine.',
  },
]

export const quickActions = [
  {
    id: 'clarify',
    title: 'Clarifier mon idée',
    agentId: 'strategist',
    description: 'Transformer le projet en angle clair, cible prioritaire et décisions à prendre.',
  },
  {
    id: 'market',
    title: 'Analyser mon marché',
    agentId: 'market-analyst',
    description: 'Cartographier clients, concurrents, objections et opportunités immédiates.',
  },
  {
    id: 'offer',
    title: 'Créer mon offre',
    agentId: 'builder',
    description: 'Assembler promesse, livrables, prix de départ et preuve de valeur.',
  },
  {
    id: 'landing',
    title: 'Générer une landing page',
    agentId: 'builder',
    description: "Créer la structure d'une page simple pour présenter l'offre et capter l'intérêt.",
  },
  {
    id: 'acquisition',
    title: "Trouver mes premiers canaux d'acquisition",
    agentId: 'growth',
    description: 'Prioriser les canaux, les messages et les actions des 7 prochains jours.',
  },
]

export const seedMissions = [
  {
    title: 'Clarifier le positionnement initial',
    agentId: 'strategist',
    description: "Synthèse de l'idée, cible prioritaire, promesse et prochaine décision.",
    progress: 68,
  },
  {
    title: 'Scanner les signaux du marché',
    agentId: 'market-analyst',
    description: 'Première lecture des concurrents, alternatives et attentes clients.',
    progress: 34,
  },
]
