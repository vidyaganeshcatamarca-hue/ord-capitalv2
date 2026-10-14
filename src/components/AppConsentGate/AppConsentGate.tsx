import { useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { ConsentGate } from '@/components/ConsentGate/ConsentGate'
import { LegalDocModal } from '@/components/LegalDocModal/LegalDocModal'
import './AppConsentGate.css'

interface AppConsentGateProps {
  children: ReactNode
}

// True ONLY when the consent gate was passed during THIS page load: module
// state dies on a full reload, which is exactly the 'came back later'
// case the recovery (welcome-back) screen targets. Fresh sign-ups pass
// the gate in the same load that starts the onboarding, so AuthPage uses
// this to continue the flow instead of offering account recovery.
let consentGatePassedThisLoad = false

export function consentJustAcceptedThisLoad(): boolean {
  return consentGatePassedThisLoad
}

// Serialización de gates: LegalUpdateGate corre su primera consulta de estado
// legal en paralelo con esta RPC de consentimiento. Para una cuenta nueva
// (especialmente vía Google OAuth, que no pre-sella aceptación en el trigger)
// esa consulta puede resolverse ANTES de que el ConsentGate registre la
// aceptación, derivar 'require_acceptance' del instante previo y pintar el
// overlay bloqueante que la aceptación del ConsentGate estaba por resolver —
// el usuario acepta dos veces seguidas (bug observado 2026-10-14, Google).
// waitForConsentGate resuelve cuando el chequeo del consentimiento quedó
// resuelto para la sesión actual (sin pendiente, o ya aceptado).
let consentSettledSinceSignIn = false
let consentWaiters: Array<() => void> = []

/**
 * Se resuelve cuando el chequeo del ConsentGate quedó resuelto para la sesión
 * actual. Nunca se cuelga: runCheck asienta en `finally` (incluso si falla la
 * RPC o no hay sesión). No reemplaza al chequeo del estado legal: solo evita
 * que el gate de re-aceptación consulte antes de que el consentimiento
 * inicial esté resuelto.
 */
export function waitForConsentGate(): Promise<void> {
  if (consentSettledSinceSignIn) return Promise.resolve()
  return new Promise<void>((resolve) => {
    consentWaiters.push(resolve)
  })
}

function settleConsentWait(): void {
  consentSettledSinceSignIn = true
  const waiters = consentWaiters
  consentWaiters = []
  for (const resolve of waiters) resolve()
}

/**
 * Invalida la serialización para la próxima sesión (SIGNED_IN con otra
 * cuenta / SIGNED_OUT): libera los esperas pendientes y obliga a re-esperar
 * el chequeo del nuevo login.
 */
function resetConsentWait(): void {
  consentSettledSinceSignIn = false
  const waiters = consentWaiters
  consentWaiters = []
  for (const resolve of waiters) resolve()
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
      // Asentar ANTES de devolver el control: tras setChecking el árbol decide
      // (ConsentGate o children), y LegalUpdateGate retoma su fetch con la
      // decisión ya tomada.
      setChecking(false)
      settleConsentWait()
    }
  }

  useEffect(() => {
    void runCheck()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Otra sesión en la misma carga de página: re-serializar los gates.
        resetConsentWait()
        void runCheck()
      } else if (event === 'SIGNED_OUT') {
        resetConsentWait()
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
          consentGatePassedThisLoad = true
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
