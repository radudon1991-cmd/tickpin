import { createClient } from '@supabase/supabase-js'

// TickPin accounts run on their own Supabase project (never the
// TruePin / homes-portal project). The anon key is public by design —
// it ships in every visitor's bundle, and Row Level Security on the
// profiles/watchlist tables is what actually protects the data.
// Fill these two values in once the TickPin project exists
// (Dashboard → Settings → API). Until then the placeholders keep the
// public site building and browsing normally; auth calls just fail
// soft and the UI stays in logged-out mode.
const SUPABASE_URL = 'https://YOUR-TICKPIN-PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR-TICKPIN-ANON-KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const authConfigured = !SUPABASE_URL.includes('YOUR-TICKPIN-PROJECT')
