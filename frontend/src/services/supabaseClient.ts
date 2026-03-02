import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client for Auth, Database, and Storage.
 *
 * Requirements:
 * 1. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing environment variables. Cloud features will not work until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
