// =====================================================================
// Outbound action tools — webhooks, transactional email, deployments
// =====================================================================
// These tools let agents reach out to the real world. They never throw
// across the boundary: every failure mode is returned as
// `{ ok: false, error }` so the agent can adapt instead of crashing the
// whole mission.
//
// Tools:
//   trigger_webhook(target_url?, payload)
//     POST a JSON payload to a webhook (Make.com, Zapier, n8n, …).
//     Falls back to MAKE_WEBHOOK_URL env if target_url is omitted.
//
//   send_email_brevo(to, subject, html, from_name?, from_email?)
//     POST to the Brevo (ex-Sendinblue) transactional email API.
//     Requires BREVO_API_KEY. Returns the messageId on success.
//
//   deploy_vercel_site(project_name, files[])
//     POST a minimal Vercel `/v13/deployments` request. Requires
//     VERCEL_TOKEN. Files are inlined as base64. Returns the URL of
//     the deployed preview.
// =====================================================================

import { z } from 'zod'

const DEFAULT_TIMEOUT_MS = 20_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------
// trigger_webhook
// ---------------------------------------------------------------------
export const TriggerWebhookInputSchema = z.object({
  target_url: z.string().url().optional(),
  payload: z.record(z.string(), z.unknown()),
  // Optional channel hint so several Make/Zapier scenarios can branch off
  // the same agent action.
  channel: z.string().min(1).max(80).optional(),
})
export type TriggerWebhookInput = z.infer<typeof TriggerWebhookInputSchema>

export interface TriggerWebhookOk {
  ok: true
  target_url: string
  status: number
  response_excerpt: string
}
export interface TriggerWebhookErr {
  ok: false
  target_url: string | null
  error: string
}
export type TriggerWebhookResult = TriggerWebhookOk | TriggerWebhookErr

export async function triggerWebhook(
  input: TriggerWebhookInput,
): Promise<TriggerWebhookResult> {
  const parsed = TriggerWebhookInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, target_url: null, error: parsed.error.message }
  }
  const { target_url, payload, channel } = parsed.data
  const url = target_url ?? process.env.MAKE_WEBHOOK_URL ?? ''
  if (!url) {
    return {
      ok: false,
      target_url: null,
      error: 'no_target_url: pass target_url or set MAKE_WEBHOOK_URL',
    }
  }
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channel ?? 'agent_action',
        emitted_at: new Date().toISOString(),
        payload,
      }),
    })
    const text = (await res.text()).slice(0, 400)
    if (!res.ok) {
      return { ok: false, target_url: url, error: `http_${res.status}: ${text}` }
    }
    return { ok: true, target_url: url, status: res.status, response_excerpt: text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, target_url: url, error: `webhook_failed: ${msg}` }
  }
}

// ---------------------------------------------------------------------
// send_email_brevo
// ---------------------------------------------------------------------
export const SendEmailBrevoInputSchema = z.object({
  to: z
    .union([
      z.string().email(),
      z.array(z.object({ email: z.string().email(), name: z.string().optional() })).min(1),
    ]),
  subject: z.string().min(1).max(280),
  html: z.string().min(1).max(200_000),
  from_email: z.string().email().optional(),
  from_name: z.string().min(1).max(120).optional(),
  reply_to: z.string().email().optional(),
})
export type SendEmailBrevoInput = z.infer<typeof SendEmailBrevoInputSchema>

export interface SendEmailBrevoOk {
  ok: true
  message_id: string | null
  provider: 'brevo'
}
export interface SendEmailBrevoErr {
  ok: false
  provider: 'brevo'
  error: string
}
export type SendEmailBrevoResult = SendEmailBrevoOk | SendEmailBrevoErr

export async function sendEmailBrevo(
  input: SendEmailBrevoInput,
): Promise<SendEmailBrevoResult> {
  const parsed = SendEmailBrevoInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, provider: 'brevo', error: parsed.error.message }
  }
  const data = parsed.data
  const apiKey = process.env.BREVO_API_KEY ?? ''
  const defaultFromEmail =
    data.from_email ?? process.env.BREVO_DEFAULT_FROM_EMAIL ?? ''
  const defaultFromName =
    data.from_name ?? process.env.BREVO_DEFAULT_FROM_NAME ?? 'Autars'

  // Dev-mode mock: if no API key is configured we DON'T actually send. We log
  // and return a synthetic message_id so the agent loop can be exercised
  // end-to-end without spamming inboxes.
  if (!apiKey) {
    console.warn(
      '[tools.actions.send_email_brevo] BREVO_API_KEY missing — mocked send',
      { to: data.to, subject: data.subject },
    )
    return { ok: true, provider: 'brevo', message_id: 'mock_no_brevo_key' }
  }
  if (!defaultFromEmail) {
    return {
      ok: false,
      provider: 'brevo',
      error: 'no_from_email: pass from_email or set BREVO_DEFAULT_FROM_EMAIL',
    }
  }

  const recipients =
    typeof data.to === 'string' ? [{ email: data.to }] : data.to

  try {
    const res = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: defaultFromEmail, name: defaultFromName },
        to: recipients,
        subject: data.subject,
        htmlContent: data.html,
        replyTo: data.reply_to ? { email: data.reply_to } : undefined,
      }),
    })
    const bodyText = await res.text()
    let body: unknown
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = { raw: bodyText.slice(0, 400) }
    }
    if (!res.ok) {
      return {
        ok: false,
        provider: 'brevo',
        error: `http_${res.status}: ${JSON.stringify(body).slice(0, 400)}`,
      }
    }
    const messageId =
      (body && typeof body === 'object' && 'messageId' in body
        ? String((body as { messageId?: unknown }).messageId ?? '')
        : '') || null
    return { ok: true, provider: 'brevo', message_id: messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, provider: 'brevo', error: `brevo_failed: ${msg}` }
  }
}

// ---------------------------------------------------------------------
// deploy_vercel_site
// ---------------------------------------------------------------------
export const DeployVercelInputSchema = z.object({
  project_name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'project_name must be kebab-case'),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(400),
        content: z.string().min(0).max(2_000_000),
        encoding: z.enum(['utf-8', 'base64']).optional().default('utf-8'),
      }),
    )
    .min(1)
    .max(50),
  target: z.enum(['production', 'preview']).optional().default('preview'),
})
export type DeployVercelInput = z.infer<typeof DeployVercelInputSchema>

export interface DeployVercelOk {
  ok: true
  url: string
  deployment_id: string | null
  target: 'production' | 'preview'
}
export interface DeployVercelErr {
  ok: false
  error: string
}
export type DeployVercelResult = DeployVercelOk | DeployVercelErr

export async function deployVercelSite(
  input: DeployVercelInput,
): Promise<DeployVercelResult> {
  const parsed = DeployVercelInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }
  const data = parsed.data
  const token = process.env.VERCEL_TOKEN ?? ''
  const teamId = process.env.VERCEL_TEAM_ID ?? ''

  if (!token) {
    console.warn(
      '[tools.actions.deploy_vercel_site] VERCEL_TOKEN missing — mocked deploy',
      { project: data.project_name, files: data.files.length },
    )
    return {
      ok: true,
      url: `https://${data.project_name}-mock.vercel.app`,
      deployment_id: 'mock_no_vercel_token',
      target: data.target ?? 'preview',
    }
  }

  // Vercel /v13/deployments expects each file as { file, data, encoding }.
  const files = data.files.map((f) => ({
    file: f.path,
    data:
      f.encoding === 'base64'
        ? f.content
        : Buffer.from(f.content, 'utf-8').toString('base64'),
    encoding: 'base64' as const,
  }))

  const endpoint = teamId
    ? `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}`
    : 'https://api.vercel.com/v13/deployments'

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.project_name,
        target: data.target ?? 'preview',
        files,
        projectSettings: { framework: null },
      }),
    })
    const bodyText = await res.text()
    let body: { url?: string; id?: string; error?: { message?: string } } = {}
    try {
      body = JSON.parse(bodyText)
    } catch {
      // fall through with empty body, error reported below
    }
    if (!res.ok) {
      const apiMsg = body?.error?.message ?? bodyText.slice(0, 400)
      return { ok: false, error: `http_${res.status}: ${apiMsg}` }
    }
    const url = body.url ? (body.url.startsWith('http') ? body.url : `https://${body.url}`) : ''
    if (!url) {
      return { ok: false, error: 'no_url_in_response' }
    }
    return {
      ok: true,
      url,
      deployment_id: body.id ?? null,
      target: data.target ?? 'preview',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `vercel_failed: ${msg}` }
  }
}
