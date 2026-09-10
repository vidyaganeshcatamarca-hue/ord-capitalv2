import { useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { ConsentGate } from '@/components/ConsentGate/ConsentGate'
import { LegalDocModal } from '@/components/LegalDocModal/LegalDocModal'
import './AppConsentGate.css'

interface AppConsentGateProps {
  children: ReactNode
}

/**
 * Gate global de consentimiento legal. Se monta entre AppVersionGate
 * y AuthProvider (a nivel App, NO dentro de AuthPage).
 *
 * Por qué a nivel App: el `ConsentGate` original vivía dentro de
 * `AuthPage`, así que sólo se mostraba durante el flujo de onboarding.
 * Usuarios con `onboarding_completo = true` saltaban AuthPage
 * (ruteados directo a `/` por PrivateRoute) y nunca veían el
 * consentimiento. Mover el gate a nivel App garantiza que CUALQUIER
 * usuario autenticado sin consentimiento sea bloqueado, sin importar
 * dónde esté.
 *
 * Comportamiento:
 *   - Sin sesión                → children (AuthPage maneja el login)
 *   - Con sesión y consent OK   → children
 *   - Con sesión y sin consent  → ConsentGate + LegalDocModal (block)
 *   - Error RPC                 → children (fail-open, se loguea)
 *
 * Re-chequea en SIGNED_IN (igual que AppVersionGate).
 * try/catch + async/await (Regla de Oro #13).
 */
export function AppConsentGate({ children }: AppConsentGateProps) {
  const [checking, setChecking] = useState(true)
  const [needsConsent, setNeedsConsent] = useState(false)
  const [legalDoc, setLegalDoc] = useState<'tyc' | 'privacidad' | null>(null)

  const runCheck = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setNeedsConsent(false)
        setChecking(false)
        return
      }
      const { data: status, error } = await supabase.rpc('fn_verificar_status_onboarding')
      if (error) throw error
      if (status && status.consentimiento_aceptado === false) {
        setNeedsConsent(true)
      } else {
        setNeedsConsent(false)
      }
    } catch (err) {
      // Fail-open: si la RPC falla, dejamos pasar al usuario. Mejor que
      // bloquearlo por un error de red. La AuthPage tiene una verificación
      // inline de respaldo para este caso.
      console.error('AppConsentGate: error al chequear consentimiento (fail-open):', err)
      setNeedsConsent(false)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void runCheck()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void runCheck()
      } else if (event === 'SIGNED_OUT') {
        setNeedsConsent(false)
        setChecking(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Mientras chequea o si no requiere consentimiento, renderizar children.
  if (checking || !needsConsent) {
    return <>{children}</>
  }

  return (
    <>
      <ConsentGate
        onAccepted={() => {
          setNeedsConsent(false)
          void runCheck()
        }}
        onOpenDoc={setLegalDoc}
      />
      <LegalDocModal
        doc={legalDoc ?? 'tyc'}
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
      />
    </>
  )
}
