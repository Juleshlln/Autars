export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

export const isSupabaseConfigured = Boolean(
  supabaseConfig.url && supabaseConfig.anonKey,
)

// TODO: Installer @supabase/supabase-js puis remplacer ce stub par createClient
// quand les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY seront pretes.
export const supabase = null
