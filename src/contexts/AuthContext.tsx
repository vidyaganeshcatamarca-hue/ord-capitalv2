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
  nombreUsuario: string
  setNombreUsuario: (val: string) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const withTimeout = <T,>(promise: PromiseLike<T>, ms = 4000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingCompleto, setOnboardingCompleto] = useState<boolean | null>(null)
  const [nombreUsuario, setNombreUsuario] = useState('')

  const fetchNombreUsuario = async (sess: Session | null) => {
    if (!sess) {
      setNombreUsuario('')
      return
    }
    try {
      const { data, error } = await supabase.rpc('fn_obtener_nombre_usuario')
      if (!error && typeof data === 'string' && data.length > 0) {
        setNombreUsuario(data)
      } else {
        const meta = sess.user.user_metadata || {}
        setNombreUsuario(meta.nombre || meta.full_name || meta.name || '')
      }
    } catch (err) {
      console.warn('Error fetching username from RPC:', err)
      const meta = sess.user.user_metadata || {}
      setNombreUsuario(meta.nombre || meta.full_name || meta.name || '')
    }
  }

  const checkOnboarding = async (sess: Session | null, retries = 3, delay = 200) => {
    if (!sess) {
      setOnboardingCompleto(false)
      return
    }
    
    // Optimista: Si ya está guardado en localStorage, lo habilitamos de inmediato para evitar bloqueos
    const localCompleted = localStorage.getItem('onboarding_completo') === 'true'
    if (localCompleted) {
      setOnboardingCompleto(true)
    }

    for (let i = 0; i < retries; i++) {
      try {
        const { data: status, error } = await withTimeout(
          supabase.rpc('fn_verificar_status_onboarding'),
          3000
        )
        if (!error && status) {
          const completed = !!status.onboarding_completo
          setOnboardingCompleto(completed)
          if (completed) {
            localStorage.setItem('onboarding_completo', 'true')
          } else {
            localStorage.removeItem('onboarding_completo')
          }
          return // Éxito
        }
        console.warn(`Intento ${i + 1} de verificar onboarding falló:`, error)
      } catch (err) {
        console.warn(`Intento ${i + 1} de verificar onboarding lanzó excepción/timeout:`, err)
      }
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
      }
    }

    // Si fallaron todos los intentos, fallback al valor de localStorage
    setOnboardingCompleto(localCompleted)
  }

  useEffect(() => {
    let active = true;

    // Agregamos timeout a getSession para evitar que cuelgue indefinidamente en reconexiones lentas
    withTimeout(supabase.auth.getSession(), 4000)
      .then(async ({ data: { session } }) => {
        if (!active) return;
        setSession(session)
        // Ejecutamos en segundo plano para no bloquear el .finally() y quitar el loading rápido
        checkOnboarding(session)
        fetchNombreUsuario(session)
      })
      .catch((err) => {
        console.error('Error fetching session (o timeout):', err)
        if (!active) return;
        setSession(null)
        setOnboardingCompleto(false)
        setNombreUsuario('')
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      setSession(session)
      if (session) {
        // Ejecutamos en segundo plano
        checkOnboarding(session)
        fetchNombreUsuario(session)
      } else {
        setOnboardingCompleto(false)
        setNombreUsuario('')
        // Solo eliminamos la bandera si el evento es explícitamente un cierre de sesión
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('onboarding_completo')
        }
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
    signOut,
    nombreUsuario,
    setNombreUsuario
  }), [session, loading, onboardingCompleto, signOut, nombreUsuario])

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
