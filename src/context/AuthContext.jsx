import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { emailForUsername, normalizeUsername } from '../config/users'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId) => {
    if (!userId) {
      setProfile(null)
      return null
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) throw error
    setProfile(data)
    return data
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      try {
        if (data.session?.user) await loadProfile(data.session.user.id)
      } catch (error) {
        console.error(error)
      } finally {
        if (mounted) setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (!nextSession?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      window.setTimeout(() => {
        loadProfile(nextSession.user.id)
          .catch((error) => console.error(error))
          .finally(() => { if (mounted) setLoading(false) })
      }, 0)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const login = async (username, password) => {
    const normalized = normalizeUsername(username)
    if (!normalized) {
      throw new Error('Informe seu usuário.')
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailForUsername(normalized),
      password,
    })

    if (error) throw error

    supabase.rpc('record_login_activity').then(({ error: logError }) => {
      if (logError) console.warn('Não foi possível registrar o acesso:', logError.message)
    })

    return data
  }

  const logout = () => supabase.auth.signOut()

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isAdmin: profile?.role === 'admin',
      login,
      logout,
      refreshProfile: () => loadProfile(session?.user?.id),
    }),
    [session, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
