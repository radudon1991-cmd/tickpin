import { createClient } from '@supabase/supabase-js'

// TickPin accounts run on their own Supabase project (never the
// TruePin / homes-portal project). The anon key is public by design —
// it ships in every visitor's bundle, and Row Level Security on the
// profiles/watchlist tables is what actually protects the data.
// Fill these two values in once the TickPin project exists
// (Dashboard → Settings → API). Until then the placeholders keep the
// public site building and browsing normally; auth calls just fail
// soft and the UI stays in logged-out mode.
const SUPABASE_URL = 'https://taapjrvxyyhpmrxlacnt.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYXBqcnZ4eXlocG1yeGxhY250Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDk0NzksImV4cCI6MjEwODc4NTQ3OX0.jcnlJyR5ljecQ86Zu75QPYtMa15RArTWheflbV1HtHE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const authConfigured = !SUPABASE_URL.includes('YOUR-TICKPIN-PROJECT')
