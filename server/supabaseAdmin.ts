// =====================================================================
// Server-side Supabase clients
// =====================================================================
// admin()  : service-role client. Bypasses RLS. Use for writes that the
//            user JWT could not perform (insert into agent_runs/deliverables,
//            update missions on behalf of the user, etc.).
// asUser(token) : anon client with the user JWT bound. Use for sanity checks
//                 like resolving auth.uid() from a bearer token.
//
// All env reads are LAZY (inside functions, not at module load), because
// vite.config.ts only propagates .env.local into process.env inside the
// `configureServer` hook — which runs after this module is first imported.
// =====================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function getUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
}

function getServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
}

function getAnonKey(): string | undefined {
  return (
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

let _admin: SupabaseClient | null = null

export function hasAdmin(): boolean {
  return Boolean(getUrl() && getServiceKey())
}

export function admin(): SupabaseClient {
  if (_admin) return _admin
  const url = getUrl()
  const serviceKey = getServiceKey()
  if (!url || !serviceKey) {
    throw new Error(
      'Server Supabase admin not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
    )
  }
  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
  return _admin
}

export function asUser(bearerToken: string): SupabaseClient {
  const url = getUrl()
  const anonKey = getAnonKey()
  if (!url || !anonKey) {
    throw new Error(
      'Server Supabase anon not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local.',
    )
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  })
}

/**
 * Resolves the authenticated user id from a bearer token. Returns null on
 * any failure — callers should map to 401.
 */
export async function resolveUserId(bearerToken: string): Promise<string | null> {
  try {
    const client = asUser(bearerToken)
    const { data, error } = await client.auth.getUser()
    if (error || !data?.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}
