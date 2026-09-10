import { useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { APP_VERSION } from '@/config/app'
import { UpdateAvailableBanner } from '@/components/UpdateAvailableBanner/UpdateAvailableBanner'
import { UpdateRequiredScreen } from '@/components/UpdateRequiredScreen/UpdateRequiredScreen'
import './AppVersionGate.css'

export type AppVersionStatus = 'ok' | 'update_available' | 'update_required'

export interface AppVersionCheckResult {
  status: AppVersionStatus
  current: string
  min_required: string
  latest: string
  store_url: string
  message: string | null
  mandatory: boolean
}

interface AppVersionGateProps {
  children: ReactNode
}

/**
 * Gate global de versión de app. Se monta por encima de AuthProvider.
 *
 * En cold start consulta la sesión; si no hay sesión (instalación nueva)
 * renderiza los children sin chequear. Con sesión, llama a
 * `fn_check_app_version(APP_VERSION)` y mapea el tri-state:
 *   - ok               → children
 *   - update_available → children + banner (dismissible si !mandatory)
 *   - update_required   → pantalla de bloqueo (sin children)
 *   - error RPC        → children (fail-open, se loguea)
 *
 * Re-chequea en SIGNED_IN (el gate se monta antes del login).
 * try/catch + async/await (Regla de Oro #13).
 */
export function AppVersionGate({ children }: AppVersionGateProps) {
  const [checking, setChecking] = useState(true)
  const [result, setResult] = useState<AppVersionCheckResult | null>(null)

  const runCheck = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setResult(null)
        setChecking(false)
        return
      }
      const { data, error } = await supabase.rpc('fn_check_app_version', {
        p_app_version: APP_VERSION,
      })
      if (error) throw error
      setResult(data as AppVersionCheckResult)
    } catch (err) {
      // Fail-open: no bloquear la app por un error de red/RPC.
      console.error('AppVersionGate: error al chequear versión (fail-open):', err)
      setResult(null)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void runCheck()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void runCheck()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Mientras chequea o si no hay resultado (fail-open / sin sesión), renderizar children.
  if (checking || !result) {
    return <>{children}</>
  }

  if (result.status === 'update_required') {
    return (
      <UpdateRequiredScreen
        storeUrl={result.store_url}
        message={result.message ?? undefined}
      />
    )
  }

  if (result.status === 'update_available') {
    return (
      <>
        {children}
        <UpdateAvailableBanner
          storeUrl={result.store_url}
          mandatory={result.mandatory}
          message={result.message ?? undefined}
        />
      </>
    )
  }

  return <>{children}</>
}
