// =====================================================================
// Legacy LLM streaming endpoints — /api/llm/brief, /api/llm/mission
// =====================================================================
// These endpoints power the original "scan / positioning / brand-kit"
// briefing flow (a guided chat where the agent asks 4 questions, then
// produces a markdown report). They predate the real agent runner in
// server/agent-handlers.ts but are still wired into the UI.
//
// Both endpoints stream Server-Sent Events to the browser. The client
// reads only `delta` and `done` events (see src/game/llm.ts), so tool
// events that existed in the original Anthropic-tools build have been
// dropped.
//
// All LLM I/O goes through server/llmClient.ts (OpenAI-compatible) so
// the same code works against Claude, GPT, or any local Ollama/vLLM
// model by changing env vars only.
// =====================================================================

import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { MISSIONS, type MissionKey } from './missions'
import { getLLM, getLLMConfig } from './llmClient'

// ---------------------------------------------------------------------
// Payload schemas
// ---------------------------------------------------------------------
const BriefMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(8000),
})

const VentureContextSchema = z.object({
  name: z.string().min(1).max(200),
  subtitle: z.string().max(400),
  industry: z.string().max(200),
})

const MissionKeySchema = z.enum(['scan', 'positioning', 'brand-kit'])

const BriefPayloadSchema = z.object({
  missionKey: MissionKeySchema,
  venture: VentureContextSchema,
  history: z.array(BriefMessageSchema).max(50),
})

const MissionPayloadSchema = z.object({
  missionKey: MissionKeySchema,
  venture: VentureContextSchema,
  brief: z.array(BriefMessageSchema).max(50),
})

export type BriefMessage = z.infer<typeof BriefMessageSchema>
export type VentureContext = z.infer<typeof VentureContextSchema>
export type { MissionKey }

// ---------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------
async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 256_000) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw) as T)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function writeSseHeaders(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

function sseSend(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function sseError(res: ServerResponse, message: string) {
  try {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
      return
    }
    sseSend(res, 'error', { message })
  } finally {
    res.end()
  }
}

// ---------------------------------------------------------------------
// /api/llm/brief
// ---------------------------------------------------------------------
export async function handleBrief(req: IncomingMessage, res: ServerResponse) {
  let rawPayload: unknown
  try {
    rawPayload = await readJsonBody<unknown>(req)
  } catch (err) {
    return sseError(res, err instanceof Error ? err.message : 'bad request')
  }
  const parsed = BriefPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return sseError(res, `invalid_payload: ${parsed.error.message}`)
  }
  const { missionKey, venture, history } = parsed.data
  const config = MISSIONS[missionKey]

  writeSseHeaders(res)
  try {
    const client = getLLM()
    const cfg = getLLMConfig()
    const stream = await client.chat.completions.create({
      model: cfg.model,
      max_tokens: config.maxBriefTokens,
      temperature: 0.5,
      stream: true,
      messages: [
        {
          role: 'system',
          content: `${config.briefSystem}

Contexte filiale :
- Nom : ${venture.name}
- Pitch : ${venture.subtitle}
- Industrie : ${venture.industry}`,
        },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        sseSend(res, 'delta', { text: delta })
      }
    }
    sseSend(res, 'done', {})
  } catch (err) {
    sseSend(res, 'error', {
      message: err instanceof Error ? err.message : 'stream failed',
    })
  } finally {
    try {
      res.end()
    } catch {
      // socket already closed
    }
  }
}

// ---------------------------------------------------------------------
// /api/llm/mission
// ---------------------------------------------------------------------
export async function handleMission(req: IncomingMessage, res: ServerResponse) {
  let rawPayload: unknown
  try {
    rawPayload = await readJsonBody<unknown>(req)
  } catch (err) {
    return sseError(res, err instanceof Error ? err.message : 'bad request')
  }
  const parsed = MissionPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return sseError(res, `invalid_payload: ${parsed.error.message}`)
  }
  const { missionKey, venture, brief } = parsed.data
  const config = MISSIONS[missionKey]

  writeSseHeaders(res)
  const briefText = brief
    .map((m) => `${m.role === 'user' ? 'Fondateur' : 'Agent'}: ${m.content}`)
    .join('\n\n')

  try {
    const client = getLLM()
    const cfg = getLLMConfig()
    const stream = await client.chat.completions.create({
      model: cfg.model,
      max_tokens: config.maxMissionTokens,
      temperature: 0.4,
      stream: true,
      messages: [
        { role: 'system', content: config.missionSystem },
        {
          role: 'user',
          content: `Filiale : ${venture.name} — ${venture.subtitle} (industrie : ${venture.industry})

Brief :
${briefText}

${config.missionUserSuffix}`,
        },
      ],
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        sseSend(res, 'delta', { text: delta })
      }
    }
    sseSend(res, 'done', {})
  } catch (err) {
    sseSend(res, 'error', {
      message: err instanceof Error ? err.message : 'stream failed',
    })
  } finally {
    try {
      res.end()
    } catch {
      // socket already closed
    }
  }
}
