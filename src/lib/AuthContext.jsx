import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, authConfigured } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  async function loadProfile(uid) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name, is_admin, created_at')
      .eq('id', uid)
      .single()
    setProfile(data || null)
  }

  useEffect(() => {
    if (!authConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user || null
      setUser(sessionUser)
      if (sessionUser) await loadProfile(sessionUser.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      const sessionUser = session?.user || null
      setUser(sessionUser)
      if (sessionUser) await loadProfile(sessionUser.id)
      else setProfile(null)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = {
    user,
    profile,
    loading,
    isAdmin: !!profile?.is_admin,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) =>
      supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      }),
    updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
    recovery,
    clearRecovery: () => setRecovery(false),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
