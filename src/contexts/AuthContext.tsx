import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  onboardingCompleto: boolean | null // null = verificando, boolean = verificado
  setOnboardingCompleto: (val: boolean) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingCompleto, setOnboardingCompleto] = useState<boolean | null>(null)

  const checkOnboarding = async (sess: Session | null) => {
    if (!sess) {
      setOnboardingCompleto(false)
      return
    }
    try {
      const { data: status, error } = await supabase.rpc('fn_verificar_status_onboarding')
      if (error) {
        console.error('Error al verificar status de onboarding:', error)
        // Fallback resiliente a localStorage si falla la RPC
        const local = localStorage.getItem('onboarding_completo') === 'true'
        setOnboardingCompleto(local)
      } else {
        const completed = !!status?.onboarding_completo
        setOnboardingCompleto(completed)
        if (completed) {
          localStorage.setItem('onboarding_completo', 'true')
        } else {
          localStorage.removeItem('onboarding_completo')
        }
      }
    } catch (err) {
      console.error('Error en checkOnboarding:', err)
      const local = localStorage.getItem('onboarding_completo') === 'true'
      setOnboardingCompleto(local)
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return;
        setSession(session)
        await checkOnboarding(session)
      })
      .catch((err) => {
        console.error('Error fetching session:', err)
        if (!active) return;
        setSession(null)
        setOnboardingCompleto(false)
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setSession(session)
      if (session) {
        await checkOnboarding(session)
      } else {
        setOnboardingCompleto(false)
        localStorage.removeItem('onboarding_completo')
      }
    })

    return () => {
      active = false;
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    onboardingCompleto,
    setOnboardingCompleto,
    signOut
  }), [session, loading, onboardingCompleto, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
