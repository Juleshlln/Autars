export type MissionKey = 'scan' | 'positioning' | 'brand-kit'

interface MissionMeta {
  agentId: string
  title: string
  output: string
  workspace: string
  contextLabel: string
}

export const MISSION_META: Record<MissionKey, MissionMeta> = {
  scan: {
    agentId: 'strategist',
    title: "Scan d'opportunité (live)",
    output: "Rapport d'opportunité",
    workspace: 'computer-1',
    contextLabel: 'Brief + Claude Opus + web_search',
  },
  positioning: {
    agentId: 'strategist',
    title: 'Brief de positionnement (live)',
    output: 'Brief de positionnement',
    workspace: 'whiteboard',
    contextLabel: 'April Dunford + web_fetch concurrents',
  },
  'brand-kit': {
    agentId: 'brandBuilder',
    title: 'Kit de marque (live)',
    output: 'Kit de marque',
    workspace: 'computer-2',
    contextLabel: 'Wordmark + palette + dispo .com',
  },
}

/* ============================================================
   MISSION_CATALOG — single source of truth for the in-game mission
   menu. Each entry exposes either:
     - mode: 'live'      → routed to the LLM brief/run pipeline
                           (uses `missionKey` against the backend).
     - mode: 'synthetic' → routed to the scripted templates in store.ts
                           (uses `templateId` against MISSION_TEMPLATES).
   ContextMenu.tsx reads only this catalog.
   ============================================================ */

export type MissionMode = 'live' | 'synthetic'

export interface MissionCatalogEntry {
  /** Unique id within the catalog (kebab-case). */
  id: string
  /** Owning agent. */
  agentId: string
  /** Player-facing title. */
  title: string
  /** Deliverable label produced by this mission. */
  output: string
  /** Execution mode. */
  mode: MissionMode
  /** Short hint shown next to the menu label. */
  hint: string
  /** Live missions reference a MissionKey on the LLM backend. */
  missionKey?: MissionKey
  /** Synthetic missions reference a MISSION_TEMPLATES key in store.ts. */
  templateId?: string
}

export const MISSION_CATALOG: MissionCatalogEntry[] = [
  {
    id: 'scan-live',
    agentId: 'strategist',
    title: "Scan d'opportunité (live)",
    output: "Rapport d'opportunité",
    mode: 'live',
    missionKey: 'scan',
    hint: 'Brief + Opus + web_search',
  },
  {
    id: 'positioning-live',
    agentId: 'strategist',
    title: 'Brief de positionnement (live)',
    output: 'Brief de positionnement',
    mode: 'live',
    missionKey: 'positioning',
    hint: 'April Dunford + web_fetch',
  },
  {
    id: 'marketing-synthetic',
    agentId: 'strategist',
    title: 'Mission Marketing',
    output: 'Plan de communication',
    mode: 'synthetic',
    templateId: 'marketing',
    hint: 'Plan de communication',
  },
  {
    id: 'brand-kit-live',
    agentId: 'brandBuilder',
    title: 'Kit de marque (live)',
    output: 'Kit de marque',
    mode: 'live',
    missionKey: 'brand-kit',
    hint: 'Wordmark + dispo .com',
  },
  {
    id: 'branding-synthetic',
    agentId: 'brandBuilder',
    title: 'Kit de marque (synthétique)',
    output: 'Kit de marque',
    mode: 'synthetic',
    templateId: 'branding',
    hint: 'Génération rapide',
  },
  {
    id: 'scan-synthetic',
    agentId: 'analyst',
    title: "Scan marché",
    output: "Rapport d'opportunité",
    mode: 'synthetic',
    templateId: 'scan',
    hint: 'Synthétique',
  },
]

export function getMissionsForAgent(agentId: string): MissionCatalogEntry[] {
  return MISSION_CATALOG.filter((m) => m.agentId === agentId)
}
