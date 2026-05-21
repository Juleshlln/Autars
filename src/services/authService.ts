import { requireSupabase } from '../lib/supabaseClient'
import type { AuthUser } from '../lib/types'
import { profileToAuthUser } from './mappers'
import { fetchOrCreateProfile } from './profilesService'

export async function signUpWithPassword(email: string, password: string): Promise<AuthUser> {
  const sb = requireSupabase()
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error("Inscription impossible. Vérifiez l'email.")
  const profile = await fetchOrCreateProfile(data.user.id, data.user.email ?? email)
  return profileToAuthUser(profile)
}

export async function signInWithPassword(email: string, password: string): Promise<AuthUser> {
  const sb = requireSupabase()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Connexion impossible.')
  const profile = await fetchOrCreateProfile(data.user.id, data.user.email ?? email)
  return profileToAuthUser(profile)
}

export async function signOut(): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  const profile = await fetchOrCreateProfile(data.user.id, data.user.email ?? '')
  return profileToAuthUser(profile)
}

export function onAuthChange(cb: (user: AuthUser | null) => void) {
  const sb = requireSupabase()
  const { data } = sb.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) return cb(null)
    try {
      const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? '')
      cb(profileToAuthUser(profile))
    } catch {
      cb(null)
    }
  })
  return () => data.subscription.unsubscribe()
}
