import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { emailForUsername, normalizeUsername } from '../config/users'

const AuthContext = createContext(null)
const AUTH_REQUEST_TIMEOUT_MS = 12000

function withTimeout(promise, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} excedeu o tempo limite.`)), AUTH_REQUEST_TIMEOUT_MS)
  })

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer))
}

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
      .abortSignal(AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS))

    if (error) throw error
    setProfile(data)
    return data
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      let initialSession = null
      try {
        const { data, error } = await withTimeout(supabase.auth.getSession(), 'A inicialização da sessão')
        if (error) throw error
        if (!mounted) return
        initialSession = data.session
        setSession(initialSession)
      } catch (error) {
        if (mounted) {
          console.error('Não foi possível inicializar a sessão:', error)
          setSession(null)
          setProfile(null)
        }
      } finally {
        if (mounted && !initialSession?.user) setLoading(false)
      }

      if (!mounted || !initialSession?.user) return

      try {
        await withTimeout(loadProfile(initialSession.user.id), 'A leitura do perfil')
      } catch (error) {
        if (mounted) {
          console.error('Não foi possível carregar o perfil:', error)
          setProfile(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initializeAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (!nextSession?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      window.setTimeout(() => {
        withTimeout(loadProfile(nextSession.user.id), 'A leitura do perfil')
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
