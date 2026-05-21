import { requireSupabase } from '../lib/supabaseClient'
import type { ProfileRow } from '../lib/database.types'

export async function fetchOrCreateProfile(userId: string, email: string): Promise<ProfileRow> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (data) return data

  // The signup trigger normally creates the row; this is a safety net.
  const fallback = {
    id: userId,
    email,
    full_name: email.split('@')[0] ?? null,
  }
  const { data: inserted, error: insertError } = await sb
    .from('profiles')
    .insert(fallback)
    .select('*')
    .single()
  if (insertError) throw insertError
  return inserted
}
