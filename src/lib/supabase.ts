// Legacy entry point — kept for back-compat with earlier imports.
// Prefer importing from `./supabaseClient` going forward.
export {
  supabase,
  supabaseConfig,
  isSupabaseConfigured,
  requireSupabase,
} from './supabaseClient'
