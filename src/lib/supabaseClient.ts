import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfig = {
  url,
  anonKey,
}

export const isSupabaseConfigured = Boolean(url && anonKey)

let _client: SupabaseClient<Database> | null = null

if (isSupabaseConfigured) {
  _client = createClient<Database>(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

export const supabase = _client

export function requireSupabase(): SupabaseClient<Database> {
  if (!_client) {
    throw new Error(
      'Supabase non configuré. Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.',
    )
  }
  return _client
}
