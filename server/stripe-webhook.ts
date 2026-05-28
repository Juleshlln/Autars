// =====================================================================
// Stripe webhook — credit users after successful payment
// =====================================================================
// POST /api/stripe/webhook
//
// Listens for two events:
//   * checkout.session.completed   (one-shot Checkout)
//   * invoice.payment_succeeded    (recurring subscription renewals)
//
// Both events are expected to carry `client_reference_id` (Checkout)
// OR `metadata.user_id` (legacy / fallback). We resolve the user id,
// look up the granted credits from one of:
//   1. metadata.credits  (explicit override the Checkout side can set)
//   2. metadata.plan_id  (resolve plans.monthly_credits from the DB)
//   3. an env-side default DEFAULT_STRIPE_CREDITS (defaults to 50_000
//      to match the user-facing copy "+50 000 crédits")
//
// Then credits the user's wallet through the service-role client AND
// inserts a credit_transactions row for audit.
//
// Signature verification: HMAC-SHA256 over `<timestamp>.<raw_body>`
// using STRIPE_WEBHOOK_SECRET. Tolerance ±5 min on the timestamp.
//
// All edge cases (invalid signature, missing user, duplicate event,
// supabase error) come back as a clean HTTP response — we never throw
// across the boundary.
// =====================================================================

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { admin, hasAdmin } from './supabaseAdmin'

const DEFAULT_GRANT = 50_000
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

interface StripeEventEnvelope {
  id: string
  type: string
  data?: { object?: Record<string, unknown> }
  created?: number
}

// ---------------------------------------------------------------------
// Raw body reader (no JSON.parse — signature is over raw bytes)
// ---------------------------------------------------------------------
async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer | string) => {
      const buf =
        typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      chunks.push(buf)
      total += buf.length
      if (total > 1_000_000) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) {
    try {
      res.end()
    } catch {
      // socket already gone
    }
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// ---------------------------------------------------------------------
// Stripe-Signature header parser
// Format: t=1234567890,v1=hash,v1=other_hash,v0=legacy
// ---------------------------------------------------------------------
interface ParsedSignatureHeader {
  timestamp: number
  v1Signatures: string[]
}

function parseStripeSignatureHeader(
  header: string | string[] | undefined,
): ParsedSignatureHeader | null {
  if (!header) return null
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw) return null
  const parts = raw.split(',')
  let timestamp = NaN
  const v1: string[] = []
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') {
      timestamp = Number(value)
    } else if (key === 'v1') {
      v1.push(value)
    }
  }
  if (!Number.isFinite(timestamp) || v1.length === 0) return null
  return { timestamp, v1Signatures: v1 }
}

function verifyStripeSignature(
  rawBody: Buffer,
  header: string | string[] | undefined,
  secret: string,
): { ok: true } | { ok: false; error: string } {
  const parsed = parseStripeSignatureHeader(header)
  if (!parsed) return { ok: false, error: 'invalid_signature_header' }
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - parsed.timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, error: 'timestamp_out_of_tolerance' }
  }
  const signedPayload = `${parsed.timestamp}.${rawBody.toString('utf8')}`
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  for (const sig of parsed.v1Signatures) {
    const sigBuf = Buffer.from(sig, 'utf8')
    if (sigBuf.length !== expectedBuf.length) continue
    if (timingSafeEqual(sigBuf, expectedBuf)) return { ok: true }
  }
  return { ok: false, error: 'signature_mismatch' }
}

// ---------------------------------------------------------------------
// Crediting logic
// ---------------------------------------------------------------------
interface ResolvedGrant {
  userId: string
  credits: number
  planId: string | null
  source: 'metadata_credits' | 'metadata_plan' | 'env_default'
}

function readString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function readNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null
  const v = (obj as Record<string, unknown>)[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
    return Number(v)
  }
  return null
}

function extractUserId(stripeObject: Record<string, unknown>): string | null {
  const direct = readString(stripeObject, 'client_reference_id')
  if (direct) return direct
  const metadata = (stripeObject.metadata as Record<string, unknown>) ?? null
  return readString(metadata, 'user_id') ?? readString(metadata, 'userId')
}

async function resolveGrantedCredits(
  stripeObject: Record<string, unknown>,
): Promise<{ credits: number; planId: string | null; source: ResolvedGrant['source'] }> {
  const metadata = (stripeObject.metadata as Record<string, unknown>) ?? null
  const explicit = readNumber(metadata, 'credits')
  if (explicit && explicit > 0) {
    return { credits: Math.floor(explicit), planId: null, source: 'metadata_credits' }
  }
  const planId = readString(metadata, 'plan_id') ?? readString(metadata, 'planId')
  if (planId) {
    try {
      const sb = admin()
      const { data } = await sb
        .from('plans')
        .select('id, monthly_credits')
        .eq('id', planId)
        .maybeSingle()
      if (data?.monthly_credits && data.monthly_credits > 0) {
        return {
          credits: data.monthly_credits,
          planId: data.id as string,
          source: 'metadata_plan',
        }
      }
    } catch (err) {
      console.warn(
        '[stripe-webhook] plan lookup failed:',
        err instanceof Error ? err.message : String(err),
      )
    }
  }
  const envDefault = Number(process.env.STRIPE_DEFAULT_CREDITS ?? '')
  const fallback = Number.isFinite(envDefault) && envDefault > 0 ? envDefault : DEFAULT_GRANT
  return { credits: Math.floor(fallback), planId: null, source: 'env_default' }
}

async function creditUser(grant: ResolvedGrant, eventId: string): Promise<void> {
  const sb = admin()

  // Idempotency: if we already processed this stripe event id, skip.
  // We piggy-back on credit_transactions.metadata to track this without
  // a dedicated table — the cheapest way to stay safe on retries.
  const { data: existing } = await sb
    .from('credit_transactions')
    .select('id')
    .eq('user_id', grant.userId)
    .contains('metadata', { stripe_event_id: eventId })
    .limit(1)
  if (existing && existing.length > 0) {
    console.info(
      `[stripe-webhook] event ${eventId} already credited to ${grant.userId}, skipping`,
    )
    return
  }

  // Upsert wallet, then increment balance. Two steps because we want to
  // guarantee an `id` exists before we update.
  const { data: walletRow, error: walletErr } = await sb
    .from('credit_wallets')
    .upsert(
      {
        user_id: grant.userId,
        balance: 0,
        monthly_allowance: 0,
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
    .select('id, balance, monthly_allowance')
    .maybeSingle()
  if (walletErr) {
    console.warn('[stripe-webhook] wallet upsert error:', walletErr.message)
  }

  let currentBalance = walletRow?.balance ?? null
  let currentAllowance = walletRow?.monthly_allowance ?? null
  if (currentBalance === null) {
    const { data: existingRow } = await sb
      .from('credit_wallets')
      .select('balance, monthly_allowance')
      .eq('user_id', grant.userId)
      .maybeSingle()
    currentBalance = existingRow?.balance ?? 0
    currentAllowance = existingRow?.monthly_allowance ?? 0
  }

  const nextBalance = (currentBalance ?? 0) + grant.credits
  // Set monthly_allowance to the granted amount when a plan is resolved;
  // otherwise leave it untouched. The product surface labels this column
  // as "monthly_credits" in the user-facing copy.
  const updates: Record<string, unknown> = { balance: nextBalance }
  if (grant.planId) {
    updates.monthly_allowance = grant.credits
    updates.last_refill_at = new Date().toISOString()
  }

  const { error: updateErr } = await sb
    .from('credit_wallets')
    .update(updates)
    .eq('user_id', grant.userId)
  if (updateErr) {
    throw new Error(`wallet_update_failed: ${updateErr.message}`)
  }

  await sb.from('credit_transactions').insert({
    user_id: grant.userId,
    workspace_id: null,
    mission_id: null,
    amount: grant.credits,
    type: grant.planId ? 'monthly_refill' : 'manual_adjustment',
    reason: `stripe:${grant.source}`,
    metadata: {
      stripe_event_id: eventId,
      plan_id: grant.planId,
      previous_balance: currentBalance,
      previous_allowance: currentAllowance,
    },
  })

  // Optional: bump the active subscription's plan when a plan was resolved.
  if (grant.planId) {
    try {
      const periodEnd = new Date(
        Date.now() + 30 * 24 * 3600 * 1000,
      ).toISOString()
      await sb.from('subscriptions').upsert(
        {
          user_id: grant.userId,
          plan_id: grant.planId,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
        },
        { onConflict: 'user_id' },
      )
    } catch (err) {
      console.warn(
        '[stripe-webhook] subscription upsert non-fatal error:',
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}

// ---------------------------------------------------------------------
// Handler — POST /api/stripe/webhook
// ---------------------------------------------------------------------
export async function handleStripeWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!hasAdmin()) {
    return send(res, 500, { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' })
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ''
  if (!secret) {
    return send(res, 500, { error: 'STRIPE_WEBHOOK_SECRET not configured' })
  }

  let rawBody: Buffer
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    return send(res, 400, {
      error: 'invalid_body',
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  const verify = verifyStripeSignature(
    rawBody,
    req.headers['stripe-signature'],
    secret,
  )
  if (!verify.ok) {
    return send(res, 400, { error: verify.error })
  }

  let event: StripeEventEnvelope
  try {
    event = JSON.parse(rawBody.toString('utf8')) as StripeEventEnvelope
  } catch (err) {
    return send(res, 400, {
      error: 'invalid_json',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
  if (!event?.id || !event?.type) {
    return send(res, 400, { error: 'invalid_event_shape' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'invoice.payment_succeeded': {
        const stripeObject = (event.data?.object as Record<string, unknown>) ?? {}
        const userId = extractUserId(stripeObject)
        if (!userId) {
          console.warn(
            `[stripe-webhook] event ${event.id} (${event.type}) has no client_reference_id / metadata.user_id`,
          )
          return send(res, 200, { received: true, skipped: 'no_user_id' })
        }
        const resolved = await resolveGrantedCredits(stripeObject)
        await creditUser(
          {
            userId,
            credits: resolved.credits,
            planId: resolved.planId,
            source: resolved.source,
          },
          event.id,
        )
        return send(res, 200, {
          received: true,
          credited: { user_id: userId, amount: resolved.credits, source: resolved.source },
        })
      }
      default:
        // Acknowledge unhandled event types so Stripe doesn't retry forever.
        return send(res, 200, { received: true, ignored: event.type })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] handler error:', message)
    // 500 makes Stripe retry — appropriate for transient DB faults.
    return send(res, 500, { error: 'handler_failed', detail: message })
  }
}
