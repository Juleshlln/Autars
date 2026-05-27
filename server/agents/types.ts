// =====================================================================
// Agent system - shared types (server-side only)
// =====================================================================

export type AgentRole = 'strategist' | 'builder' | 'growth' | 'finance'

export type AgentMissionType =
  | 'clarify-business-idea'
  | 'scan'
  | 'positioning'
  | 'segment'
  | 'value-prop'
  | 'offer'
  | 'landing'
  | 'acquisition'
  | 'brand-kit'

export interface AgentRunContext {
  workspaceId: string
  ownerId: string
  missionId: string
  agentId: string | null
  missionTitle: string
  missionDescription: string
  missionType: string | null
  workspace: {
    name: string
    description: string
    stage: string
  }
  context: {
    business_idea: string | null
    target_customer: string | null
    market: string | null
    tone: string | null
    constraints: string | null
    goals: string | null
  }
  previousDeliverables: Array<{
    mission_title: string
    title: string
    summary: string | null
    structured_content: Record<string, unknown>
    decision: 'validated' | 'needs_improvement' | 'rejected' | null
  }>
  agentMemory: Array<{
    memory_type: string
    content: string
  }>
  iterationFeedback?: string
  previousDeliverableContent?: Record<string, unknown>
}

export interface RecommendedNextMission {
  title: string
  description: string
  agent_role: AgentRole
  mission_type: AgentMissionType
  priority: 'high' | 'medium' | 'low'
  cost_credits?: number
}

export interface ClarifyBusinessIdeaOutput {
  title: string
  summary: string
  business_idea: string
  target_customer: string
  problem: string
  value_proposition: string
  key_assumptions: string[]
  risks: string[]
  recommended_next_missions: RecommendedNextMission[]
  // Context fields the orchestrator persists back into workspace_context.
  context_updates?: {
    business_idea?: string
    target_customer?: string
    market?: string
    tone?: string
    constraints?: string
    goals?: string
  }
  // Memory items the orchestrator persists into agent_memory.
  memory_items?: Array<{
    memory_type: 'fact' | 'preference' | 'constraint' | 'validated_decision' | 'rejected_idea'
    content: string
  }>
}

export interface ScanReportOutput {
  title: string
  summary: string
  // Markdown body for human-readable rendering.
  markdown: string
  recommended_next_missions: RecommendedNextMission[]
}

export type AgentOutput = ClarifyBusinessIdeaOutput | ScanReportOutput

export interface AgentMissionDefinition {
  role: AgentRole
  missionType: AgentMissionType
  outputFormat: 'json' | 'markdown'
  systemPrompt: string
  // Builds the final user prompt from the run context.
  buildUserPrompt: (ctx: AgentRunContext) => string
  // Anthropic settings.
  model: string
  maxTokens: number
  enableWebSearch?: boolean
  enableWebFetch?: boolean
  // For JSON outputs: zero-runtime-cost shape validator. Returns null
  // if the parsed object is valid, otherwise a short error string.
  validateOutput?: (parsed: unknown) => string | null
}
