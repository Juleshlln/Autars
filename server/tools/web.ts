// =====================================================================
// Web tools — search + scrape, exposed to agents via function calling
// =====================================================================
// Two zero-cost tools that move agents from "speculation" to "grounded
// reasoning":
//
//   web_search(query, max_results?)
//     Hits the DuckDuckGo HTML endpoint (no API key, no quota tracking)
//     and returns up to N results as { title, url, snippet }.
//
//   web_scrape(url)
//     Fetches the URL, follows redirects, strips scripts/styles/markup
//     and returns the visible text of the <body>. Truncates to a safe
//     ceiling so a 5 MB HTML page can't blow the agent context.
//
// Both tools NEVER throw across the boundary. Failure modes (timeout,
// non-2xx, body too large) come back as `{ ok: false, error }` so the
// agent can adapt its plan instead of the whole mission crashing.
// =====================================================================

import { z } from 'zod'

// ---------------------------------------------------------------------
// Shared HTTP helpers
// ---------------------------------------------------------------------
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 4_000_000 // 4 MB cap on raw HTML download
const MAX_TEXT_CHARS = 18_000 // truncate scraped text returned to LLM
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.4 Safari/605.1.15 AutarsAgent/1.0'

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        ...(init.headers ?? {}),
      },
      redirect: 'follow',
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  // Read as ArrayBuffer so we can enforce a hard ceiling. Streaming the body
  // and aborting after `maxBytes` is cleaner but the Response API does not
  // expose a sync byte counter — buffer-then-truncate is good enough at this
  // scale and avoids dragging in a stream lib.
  const buf = await res.arrayBuffer()
  const sliced = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf
  return new TextDecoder('utf-8', { fatal: false }).decode(sliced)
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, d) => {
      const n = Number(d)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const n = parseInt(h, 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    })
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
}

function collapseWhitespace(input: string): string {
  return input.replace(/[\t ]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function extractBody(html: string): string {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  return bodyMatch ? bodyMatch[1] : html
}

// ---------------------------------------------------------------------
// web_search
// ---------------------------------------------------------------------
export const WebSearchInputSchema = z.object({
  query: z.string().min(2).max(400),
  max_results: z.number().int().min(1).max(10).optional().default(5),
})
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>

export interface WebSearchResultItem {
  title: string
  url: string
  snippet: string
}

export interface WebSearchOk {
  ok: true
  query: string
  results: WebSearchResultItem[]
}
export interface WebSearchErr {
  ok: false
  query: string
  error: string
}
export type WebSearchResult = WebSearchOk | WebSearchErr

// DuckDuckGo wraps real result URLs inside /l/?uddg=<encoded-url>. Unwrap it
// so the agent gets the canonical URL it can pass to web_scrape directly.
function unwrapDdgRedirect(href: string): string {
  try {
    const u = href.startsWith('//')
      ? new URL('https:' + href)
      : new URL(href, 'https://duckduckgo.com')
    if (u.pathname.startsWith('/l/')) {
      const target = u.searchParams.get('uddg')
      if (target) return decodeURIComponent(target)
    }
    return u.toString()
  } catch {
    return href
  }
}

function parseDdgHtml(html: string, max: number): WebSearchResultItem[] {
  const items: WebSearchResultItem[] = []
  // Match <a class="result__a" href="..."> ... </a> blocks plus the snippet
  // that follows. The DDG HTML markup has been stable since 2018 so a regex
  // pass is enough — switching to cheerio just for two fields is overkill.
  const linkRe =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) && items.length < max) {
    const rawHref = match[1]
    const rawTitle = collapseWhitespace(decodeHtmlEntities(stripTags(match[2])))
    if (!rawTitle) continue
    // Look ahead for the next snippet block tied to this result.
    const tail = html.slice(match.index, match.index + 4000)
    const snipMatch = tail.match(
      /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    )
    const snippet = snipMatch
      ? collapseWhitespace(decodeHtmlEntities(stripTags(snipMatch[1])))
      : ''
    items.push({
      title: rawTitle,
      url: unwrapDdgRedirect(rawHref),
      snippet,
    })
  }
  return items
}

export async function webSearch(input: WebSearchInput): Promise<WebSearchResult> {
  const parsed = WebSearchInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, query: String(input?.query ?? ''), error: parsed.error.message }
  }
  const { query, max_results } = parsed.data
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  try {
    const res = await fetchWithTimeout(endpoint, { method: 'POST' })
    if (!res.ok) {
      return { ok: false, query, error: `http_${res.status}` }
    }
    const html = await readBodyCapped(res, MAX_BODY_BYTES)
    const results = parseDdgHtml(html, max_results ?? 5)
    if (results.length === 0) {
      return { ok: false, query, error: 'no_results' }
    }
    return { ok: true, query, results }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, query, error: `search_failed: ${msg}` }
  }
}

// ---------------------------------------------------------------------
// web_scrape
// ---------------------------------------------------------------------
export const WebScrapeInputSchema = z.object({
  url: z.string().url(),
  max_chars: z.number().int().min(500).max(40_000).optional(),
})
export type WebScrapeInput = z.infer<typeof WebScrapeInputSchema>

export interface WebScrapeOk {
  ok: true
  url: string
  final_url: string
  title: string | null
  text: string
  truncated: boolean
}
export interface WebScrapeErr {
  ok: false
  url: string
  error: string
}
export type WebScrapeResult = WebScrapeOk | WebScrapeErr

export async function webScrape(input: WebScrapeInput): Promise<WebScrapeResult> {
  const parsed = WebScrapeInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, url: String(input?.url ?? ''), error: parsed.error.message }
  }
  const { url, max_chars } = parsed.data
  try {
    // SSRF guard: refuse private/loopback/link-local hostnames so an agent
    // cannot exfiltrate from internal services if anyone deploys this with
    // network access to a private VPC.
    const host = new URL(url).hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return { ok: false, url, error: 'host_blocked' }
    }
    const res = await fetchWithTimeout(url, { method: 'GET' })
    if (!res.ok) {
      return { ok: false, url, error: `http_${res.status}` }
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return { ok: false, url, error: `unsupported_content_type:${contentType}` }
    }
    const html = await readBodyCapped(res, MAX_BODY_BYTES)
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch
      ? collapseWhitespace(decodeHtmlEntities(stripTags(titleMatch[1]))) || null
      : null
    const bodyHtml = extractBody(html)
    const text = collapseWhitespace(decodeHtmlEntities(stripTags(bodyHtml)))
    const limit = max_chars ?? MAX_TEXT_CHARS
    const truncated = text.length > limit
    return {
      ok: true,
      url,
      final_url: res.url || url,
      title,
      text: truncated ? text.slice(0, limit) : text,
      truncated,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, url, error: `scrape_failed: ${msg}` }
  }
}
