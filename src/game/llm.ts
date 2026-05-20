export interface BriefMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface VentureContext {
  name: string
  subtitle: string
  industry: string
}

export interface ScanEvent {
  type: 'delta' | 'tool' | 'tool_result' | 'done' | 'error'
  text?: string
  name?: string
  kind?: string
  message?: string
}

async function* streamSse(
  endpoint: string,
  body: unknown,
): AsyncGenerator<ScanEvent, void, void> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok || !resp.body) {
    let detail = `HTTP ${resp.status}`
    try {
      const j = (await resp.json()) as { error?: string }
      if (j.error) detail = j.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nlIdx
      while ((nlIdx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, nlIdx)
        buffer = buffer.slice(nlIdx + 2)
        let evName = 'message'
        let dataLine = ''
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event: ')) evName = line.slice(7).trim()
          else if (line.startsWith('data: ')) dataLine = line.slice(6)
        }
        if (!dataLine) continue
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(dataLine) as Record<string, unknown>
        } catch {
          continue
        }
        if (evName === 'error') {
          throw new Error(String(parsed.message ?? 'stream error'))
        }
        if (evName === 'done') {
          return
        }
        yield { type: evName as ScanEvent['type'], ...parsed }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

export type MissionKey = 'scan' | 'positioning' | 'brand-kit'

export async function* streamBriefTurn(
  missionKey: MissionKey,
  venture: VentureContext,
  history: BriefMessage[],
): AsyncGenerator<string, void, void> {
  for await (const ev of streamSse('/api/llm/brief', {
    missionKey,
    venture,
    history,
  })) {
    if (ev.type === 'delta' && ev.text) yield ev.text
  }
}

export async function* streamMission(
  missionKey: MissionKey,
  venture: VentureContext,
  brief: BriefMessage[],
): AsyncGenerator<ScanEvent, void, void> {
  for await (const ev of streamSse('/api/llm/mission', {
    missionKey,
    venture,
    brief,
  })) {
    yield ev
  }
}

let healthCache: boolean | null = null

export async function checkApiHealth(): Promise<boolean> {
  if (healthCache !== null) return healthCache
  try {
    const resp = await fetch('/api/llm/health')
    if (!resp.ok) return (healthCache = false)
    const j = (await resp.json()) as { hasKey?: boolean }
    return (healthCache = Boolean(j.hasKey))
  } catch {
    return (healthCache = false)
  }
}
