// =====================================================================
// Zod schemas — strict runtime validation for LLM output + HTTP payloads
// =====================================================================
// Every value crossing a trust boundary (HTTP body, LLM raw text, DB JSONB)
// is parsed through one of these schemas before it propagates. If the input
// shape drifts, `safeParse` returns an error instead of throwing deep in
// the call stack, so callers can flip the mission to `failed` with a clean
// activity log entry.
// =====================================================================

import { z } from 'zod'

// ---------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------
export const AgentRoleSchema = z.enum([
  'strategist',
  'builder',
  'growth',
  'finance',
])

export const AgentMissionTypeSchema = z.enum([
  'clarify-business-idea',
  'scan',
  'positioning',
  'segment',
  'value-prop',
  'offer',
  'landing',
  'acquisition',
  'brand-kit',
  'pricing',
  'business-model',
  'roadmap',
  'content-plan',
])

export const RecommendedNextMissionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  agent_role: AgentRoleSchema,
  mission_type: AgentMissionTypeSchema,
  priority: z.enum(['high', 'medium', 'low']),
  cost_credits: z.number().int().nonnegative().optional(),
})

export const MemoryItemSchema = z.object({
  memory_type: z.enum([
    'fact',
    'preference',
    'constraint',
    'validated_decision',
    'rejected_idea',
  ]),
  content: z.string().min(1),
})

export const ContextUpdatesSchema = z
  .object({
    business_idea: z.string().optional(),
    target_customer: z.string().optional(),
    market: z.string().optional(),
    tone: z.string().optional(),
    constraints: z.string().optional(),
    goals: z.string().optional(),
  })
  .partial()
  .optional()

// ---------------------------------------------------------------------
// clarify-business-idea — strict JSON output
// ---------------------------------------------------------------------
export const ClarifyBusinessIdeaOutputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  business_idea: z.string(),
  target_customer: z.string(),
  problem: z.string(),
  value_proposition: z.string(),
  key_assumptions: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
  recommended_next_missions: z.array(RecommendedNextMissionSchema),
  context_updates: ContextUpdatesSchema,
  memory_items: z.array(MemoryItemSchema).optional(),
})

export type ClarifyBusinessIdeaOutputZ = z.infer<
  typeof ClarifyBusinessIdeaOutputSchema
>

// ---------------------------------------------------------------------
// Agent metadata block — appended at the end of every Markdown deliverable
// inside an `<!--AUTARS_METADATA:{...}-->` comment. Lets the orchestrator
// extract next-mission recommendations + memory items from a free-form
// markdown report.
// ---------------------------------------------------------------------
export const AgentMetadataSchema = z.object({
  summary: z.string().min(1),
  recommended_next_missions: z.array(RecommendedNextMissionSchema).default([]),
  memory_items: z.array(MemoryItemSchema).default([]),
  context_updates: ContextUpdatesSchema,
})

export type AgentMetadataZ = z.infer<typeof AgentMetadataSchema>

// ---------------------------------------------------------------------
// HTTP payloads
// ---------------------------------------------------------------------
export const RunPayloadSchema = z.object({
  missionId: z.string().uuid(),
})

export const IteratePayloadSchema = z.object({
  deliverableId: z.string().uuid(),
  feedback: z.string().min(1).max(4000),
})

export const DecidePayloadSchema = z.object({
  deliverableId: z.string().uuid(),
  decision: z.enum(['validated', 'rejected']),
  feedback: z.string().max(4000).optional(),
})

export const NextPayloadSchema = z.object({
  fromDeliverableId: z.string().uuid(),
  recommendationIndex: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ')
}
