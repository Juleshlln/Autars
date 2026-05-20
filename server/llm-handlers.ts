import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { MISSIONS, type MissionKey } from './missions'

export interface BriefMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface VentureContext {
  name: string
  subtitle: string
  industry: string
}

interface BriefPayload {
  missionKey: MissionKey
  venture: VentureContext
  history: BriefMessage[]
}

interface MissionPayload {
  missionKey: MissionKey
  venture: VentureContext
  brief: BriefMessage[]
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY missing on server')
  }
  return new Anthropic({ apiKey })
}

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

export async function handleBrief(req: IncomingMessage, res: ServerResponse) {
  let payload: BriefPayload
  try {
    payload = await readJsonBody<BriefPayload>(req)
  } catch (err) {
    return sseError(res, err instanceof Error ? err.message : 'bad request')
  }
  const { missionKey, venture, history } = payload
  const config = MISSIONS[missionKey]
  if (!config || !venture || !Array.isArray(history)) {
    return sseError(res, 'invalid payload')
  }

  let client: Anthropic
  try {
    client = getClient()
  } catch (err) {
    return sseError(res, err instanceof Error ? err.message : 'server config')
  }

  writeSseHeaders(res)
  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: config.maxBriefTokens,
      system: `${config.briefSystem}

Contexte filiale :
- Nom : ${venture.name}
- Pitch : ${venture.subtitle}
- Industrie : ${venture.industry}`,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        sseSend(res, 'delta', { text: event.delta.text })
      }
    }
    sseSend(res, 'done', {})
  } catch (err) {
    sseSend(res, 'error', {
      message: err instanceof Error ? err.message : 'stream failed',
    })
  } finally {
    res.end()
  }
}

export async function handleMission(req: IncomingMessage, res: ServerResponse) {
  let payload: MissionPayload
  try {
    payload = await readJsonBody<MissionPayload>(req)
  } catch (err) {
    return sseError(res, err instanceof Error ? err.message : 'bad request')
  }
  const { missionKey, venture, brief } = payload
  const config = MISSIONS[missionKey]
  if (!config || !venture || !Array.isArray(brief)) {
    return sseError(res, 'invalid payload')
  }

  let client: Anthropic
  try {
    client = getClient()
  } catch (err) {
    return sseError(res, err instanceof Error ? err.message : 'server config')
  }

  writeSseHeaders(res)
  const briefText = brief
    .map((m) => `${m.role === 'user' ? 'Fondateur' : 'Agent'}: ${m.content}`)
    .join('\n\n')

  const tools: Array<{ type: string; name: string }> = []
  if (config.enableWebSearch) {
    tools.push({ type: 'web_search_20260209', name: 'web_search' })
  }
  if (config.enableWebFetch) {
    tools.push({ type: 'web_fetch_20260209', name: 'web_fetch' })
  }

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: config.maxMissionTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      ...(tools.length > 0 ? { tools } : {}),
      system: config.missionSystem,
      messages: [
        {
          role: 'user',
          content: `Filiale : ${venture.name} — ${venture.subtitle} (industrie : ${venture.industry})

Brief :
${briefText}

${config.missionUserSuffix}`,
        },
      ],
    } as Parameters<typeof client.messages.stream>[0])

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'server_tool_use') {
          sseSend(res, 'tool', { name: event.content_block.name })
        } else if (
          event.content_block.type === 'web_search_tool_result' ||
          event.content_block.type === 'web_fetch_tool_result'
        ) {
          sseSend(res, 'tool_result', { kind: event.content_block.type })
        }
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        sseSend(res, 'delta', { text: event.delta.text })
      }
    }
    sseSend(res, 'done', {})
  } catch (err) {
    sseSend(res, 'error', {
      message: err instanceof Error ? err.message : 'stream failed',
    })
  } finally {
    res.end()
  }
}
