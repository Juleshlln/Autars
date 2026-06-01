// =====================================================================
// Tool registry — agent-facing tools + ReAct execution loop
// =====================================================================
// Each tool entry exposes:
//   - name        : the LLM-visible function name
//   - description : one-liner so the model picks the right tool
//   - parameters  : JSON Schema (hand-written to stay vendor-agnostic;
//                   matches the zod schema used to validate the input)
//   - run         : dispatch into the typed implementation. Receives a
//                   `ToolExecutionContext` so memory tools know the
//                   workspace, action tools can log on behalf of the
//                   owner, etc.
//
// `executeToolCalls` is the ReAct dispatcher used by runAgentMission:
// given the raw tool_calls returned by the LLM, it runs every call in
// parallel (they have no inter-dep), pipes a `[Outil]…` or `[Action]…`
// log into onProgress, and returns the OpenAI-shaped `tool` messages so
// the next LLM iteration can read the outputs.
// =====================================================================

import type { AgentRole } from '../agents/types'
import {
  webSearch,
  webScrape,
  WebSearchInputSchema,
  WebScrapeInputSchema,
} from './web'
import {
  triggerWebhook,
  sendEmailBrevo,
  deployVercelSite,
  TriggerWebhookInputSchema,
  SendEmailBrevoInputSchema,
  DeployVercelInputSchema,
} from './actions'
import { searchMemoryTool, SearchMemoryInputSchema } from './memory'

// ---------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------
export interface ToolExecutionContext {
  workspaceId: string
  ownerId: string
  agentId: string | null
  missionId: string
}

export type ToolKind = 'tool' | 'action' | 'memory'

export interface ToolDefinition {
  name: string
  kind: ToolKind
  description: string
  parameters: Record<string, unknown>
  run: (args: unknown, ctx: ToolExecutionContext) => Promise<unknown>
}

// OpenAI tool_calls payload shape (vendor-neutral subset).
export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIToolMessage {
  role: 'tool'
  tool_call_id: string
  name: string
  content: string
}

export interface ToolDispatchLogEntry {
  name: string
  kind: ToolKind
  emoji: string
  display: string // free-form summary for the activity log
  ok: boolean
}

// ---------------------------------------------------------------------
// Argument parsing helper — LLMs occasionally double-encode JSON args.
// ---------------------------------------------------------------------
function parseToolArguments(raw: string): unknown {
  if (!raw || typeof raw !== 'string') return {}
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return { _raw: trimmed }
  }
}

function summariseInput(input: unknown, max = 80): string {
  if (input === null || input === undefined) return ''
  if (typeof input === 'string') return input.slice(0, max)
  try {
    const json = JSON.stringify(input)
    return json.length > max ? json.slice(0, max) + '…' : json
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------
export const WEB_SEARCH_TOOL: ToolDefinition = {
  name: 'web_search',
  kind: 'tool',
  description:
    'Recherche le web en français/anglais via DuckDuckGo. Renvoie jusqu\'à 5 résultats (titre, url, snippet). À utiliser pour valider taille de marché, trouver concurrents réels, repérer un pain client.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'La requête de recherche, 2-400 caractères.',
      },
      max_results: {
        type: 'integer',
        description: 'Nombre max de résultats (1-10). Défaut: 5.',
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  run: async (args) => {
    const parsed = WebSearchInputSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    return webSearch(parsed.data)
  },
}

export const WEB_SCRAPE_TOOL: ToolDefinition = {
  name: 'web_scrape',
  kind: 'tool',
  description:
    'Télécharge une page web et renvoie le texte brut du <body>. Utiliser après web_search pour lire une source en détail. Pas de JS, pas de SPA.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL absolue à scraper (https:// recommandé).',
      },
      max_chars: {
        type: 'integer',
        description:
          'Limite de caractères du texte retourné (500-40000). Défaut: 18000.',
        minimum: 500,
        maximum: 40000,
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  run: async (args) => {
    const parsed = WebScrapeInputSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    return webScrape(parsed.data)
  },
}

export const TRIGGER_WEBHOOK_TOOL: ToolDefinition = {
  name: 'trigger_webhook',
  kind: 'action',
  description:
    'POST un payload JSON vers un webhook externe (Make.com, Zapier, n8n). Si target_url est omis, utilise MAKE_WEBHOOK_URL. Utiliser pour déclencher une automatisation hors-app.',
  parameters: {
    type: 'object',
    properties: {
      target_url: { type: 'string', description: 'URL du webhook cible (optionnel).' },
      channel: {
        type: 'string',
        description: 'Étiquette de routage côté Make/Zapier (optionnel).',
      },
      payload: {
        type: 'object',
        description: 'Objet JSON à envoyer en body.',
      },
    },
    required: ['payload'],
    additionalProperties: false,
  },
  run: async (args) => {
    const parsed = TriggerWebhookInputSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    return triggerWebhook(parsed.data)
  },
}

export const SEND_EMAIL_BREVO_TOOL: ToolDefinition = {
  name: 'send_email_brevo',
  kind: 'action',
  description:
    'Envoie un email transactionnel via Brevo. Utiliser pour outreach commercial, suivi prospect, confirmation. Le HTML doit être inline.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        oneOf: [
          { type: 'string', description: 'Email du destinataire.' },
          {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                name: { type: 'string' },
              },
              required: ['email'],
              additionalProperties: false,
            },
          },
        ],
      },
      subject: { type: 'string', description: 'Objet de l\'email.' },
      html: { type: 'string', description: 'Corps HTML inline.' },
      from_email: { type: 'string', description: 'Expéditeur (optionnel).' },
      from_name: { type: 'string', description: 'Nom expéditeur (optionnel).' },
      reply_to: { type: 'string', description: 'Email reply-to (optionnel).' },
    },
    required: ['to', 'subject', 'html'],
    additionalProperties: false,
  },
  run: async (args) => {
    const parsed = SendEmailBrevoInputSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    return sendEmailBrevo(parsed.data)
  },
}

export const DEPLOY_VERCEL_TOOL: ToolDefinition = {
  name: 'deploy_vercel_site',
  kind: 'action',
  description:
    'Déploie un site statique sur Vercel à partir d\'une liste de fichiers (html/css/js). Renvoie l\'URL publique du preview. Utiliser pour publier une landing page.',
  parameters: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Nom kebab-case du projet Vercel.',
      },
      target: {
        type: 'string',
        enum: ['production', 'preview'],
        description: 'Cible de déploiement. Défaut: preview.',
      },
      files: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Chemin relatif (ex: index.html).' },
            content: { type: 'string', description: 'Contenu du fichier.' },
            encoding: {
              type: 'string',
              enum: ['utf-8', 'base64'],
              description: 'Encodage du contenu. Défaut: utf-8.',
            },
          },
          required: ['path', 'content'],
          additionalProperties: false,
        },
      },
    },
    required: ['project_name', 'files'],
    additionalProperties: false,
  },
  run: async (args) => {
    const parsed = DeployVercelInputSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    return deployVercelSite(parsed.data)
  },
}

export const SEARCH_MEMORY_TOOL: ToolDefinition = {
  name: 'search_memory',
  kind: 'memory',
  description:
    'Recherche sémantique (RAG) dans la mémoire long-terme de la filiale : anciens livrables, notes, contextes. Renvoie jusqu\'à 5 extraits avec score de similarité. Utiliser avant de redémarrer un sujet déjà traité.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Question ou phrase représentative à rechercher.',
      },
      match_threshold: {
        type: 'number',
        description: 'Seuil de similarité cosinus (0-1). Défaut: 0.7.',
        minimum: 0,
        maximum: 1,
      },
      match_count: {
        type: 'integer',
        description: 'Nombre max d\'extraits (1-15). Défaut: 5.',
        minimum: 1,
        maximum: 15,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    const parsed = SearchMemoryInputSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: parsed.error.message }
    return searchMemoryTool(ctx.workspaceId, parsed.data)
  },
}

// ---------------------------------------------------------------------
// Per-role tool allow-list
// ---------------------------------------------------------------------
// Every role gets web + memory. Outbound actions are gated by role so a
// rogue plan from the Strategist cannot, say, deploy to Vercel.
const COMMON_TOOLS: ToolDefinition[] = [
  WEB_SEARCH_TOOL,
  WEB_SCRAPE_TOOL,
  SEARCH_MEMORY_TOOL,
]

const ROLE_TOOLS: Record<AgentRole, ToolDefinition[]> = {
  strategist: [...COMMON_TOOLS, TRIGGER_WEBHOOK_TOOL],
  builder: [...COMMON_TOOLS, DEPLOY_VERCEL_TOOL, TRIGGER_WEBHOOK_TOOL],
  growth: [...COMMON_TOOLS, SEND_EMAIL_BREVO_TOOL, TRIGGER_WEBHOOK_TOOL],
  finance: [...COMMON_TOOLS, TRIGGER_WEBHOOK_TOOL],
}

export function toolsForRole(role: AgentRole): ToolDefinition[] {
  return ROLE_TOOLS[role] ?? COMMON_TOOLS
}

export function asOpenAITools(
  tools: ToolDefinition[],
): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

// ---------------------------------------------------------------------
// Visual log emoji by kind
// ---------------------------------------------------------------------
function emojiFor(kind: ToolKind, name: string): string {
  if (kind === 'action') {
    if (name.includes('email')) return '✉️'
    if (name.includes('deploy')) return '🚀'
    if (name.includes('webhook')) return '🪝'
    return '🚀'
  }
  if (kind === 'memory') return '🧠'
  if (name.includes('search')) return '🌐'
  if (name.includes('scrape')) return '📄'
  return '🔧'
}

function logPrefixFor(kind: ToolKind): string {
  if (kind === 'action') return '[Action]'
  if (kind === 'memory') return '[Mémoire]'
  return '[Outil]'
}

export interface ExecuteToolCallsParams {
  toolCalls: OpenAIToolCall[]
  tools: ToolDefinition[]
  ctx: ToolExecutionContext
  onProgress?: (entry: ToolDispatchLogEntry & { phase: 'act' }) => Promise<void>
}

export interface ExecuteToolCallsResult {
  messages: OpenAIToolMessage[]
  log: ToolDispatchLogEntry[]
}

// ---------------------------------------------------------------------
// executeToolCalls — dispatch + parallel run + log emission
// ---------------------------------------------------------------------
export async function executeToolCalls(
  params: ExecuteToolCallsParams,
): Promise<ExecuteToolCallsResult> {
  const byName = new Map<string, ToolDefinition>()
  for (const t of params.tools) byName.set(t.name, t)

  const tasks = params.toolCalls.map(async (call) => {
    const def = byName.get(call.function.name)
    const args = parseToolArguments(call.function.arguments)
    const inputSummary = summariseInput(args)

    if (!def) {
      const errEntry: ToolDispatchLogEntry = {
        name: call.function.name,
        kind: 'tool',
        emoji: '⚠️',
        display: `${call.function.name}: outil inconnu`,
        ok: false,
      }
      return {
        msg: {
          role: 'tool' as const,
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify({ ok: false, error: 'unknown_tool' }),
        },
        entry: errEntry,
      }
    }

    const emoji = emojiFor(def.kind, def.name)
    const prefix = logPrefixFor(def.kind)

    // Emit "starting" log so the user sees activity in real-time even if
    // the tool takes 15s (web_scrape on a slow CDN).
    if (params.onProgress) {
      try {
        await params.onProgress({
          phase: 'act',
          name: def.name,
          kind: def.kind,
          emoji,
          display: `${prefix} ${emoji} ${def.name} : ${inputSummary}`,
          ok: true,
        })
      } catch {
        // Logging failures must never block the tool call.
      }
    }

    let result: unknown
    let ok = true
    try {
      result = await def.run(args, params.ctx)
      if (result && typeof result === 'object' && 'ok' in result) {
        ok = Boolean((result as { ok?: unknown }).ok)
      }
    } catch (err) {
      ok = false
      result = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    const entry: ToolDispatchLogEntry = {
      name: def.name,
      kind: def.kind,
      emoji,
      display: `${prefix} ${emoji} ${def.name}${ok ? '' : ' (échec)'} : ${inputSummary}`,
      ok,
    }

    // Cap the content sent back to the LLM. Tool outputs can be huge
    // (a 40k-char scrape) and the next turn pays for every char.
    let serialised: string
    try {
      serialised = JSON.stringify(result)
    } catch {
      serialised = '{"ok":false,"error":"serialisation_failed"}'
    }
    if (serialised.length > 24_000) {
      serialised = serialised.slice(0, 24_000) + '…[truncated]'
    }

    return {
      msg: {
        role: 'tool' as const,
        tool_call_id: call.id,
        name: def.name,
        content: serialised,
      },
      entry,
    }
  })

  const settled = await Promise.all(tasks)
  return {
    messages: settled.map((s) => s.msg),
    log: settled.map((s) => s.entry),
  }
}
