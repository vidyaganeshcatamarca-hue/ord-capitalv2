import { useState, useEffect, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import {
  obtenerEstadoLegal,
  registrarConsentimiento,
  registrarNotificacionLegal,
  type LegalEstado,
} from '@/hooks/useConsentimientoLegal'
import { ConsentCheckbox } from '@/components/ConsentCheckbox/ConsentCheckbox'
import { LegalDocModal } from '@/components/LegalDocModal/LegalDocModal'
import './LegalUpdateGate.css'

interface LegalUpdateGateProps {
  children: ReactNode
}

// Session memory: module state dies on a full reload, which is exactly the
// "next app open" boundary for the SPA (same convention as AppConsentGate's
// consentJustAcceptedThisLoad). The gate must call fn_obtener_estado_legal
// ONCE per session and never re-check after dismissal within that session.
let legalEstadoThisSession: LegalEstado | null = null
let legalEstadoFetchedThisSession = false

// Document mapping between the DB key (fn_obtener_estado_legal) and the
// public HTML link used by LegalDocModal.
const DOC_LINK: Record<'terminos' | 'privacidad', 'tyc' | 'privacidad'> = {
  terminos: 'tyc',
  privacidad: 'privacidad',
}

const DOC_LABEL_KEY: Record<'terminos' | 'privacidad', string> = {
  terminos: 'legal_update_terms_label',
  privacidad: 'legal_update_privacy_label',
}

/**
 * Gate de versionado legal (spec versionado-legal §5). Se monta por encima
 * del arbol autenticado, DENTRO de AppConsentGate para no solaparse con el
 * gate de onboarding.
 *
 * Al arranque de sesion llama `fn_obtener_estado_legal` UNA vez y guarda el
 * resultado en memoria de sesion (module state). Segun el `pending_action`
 * por documento:
 *   - 'require_acceptance' → overlay bloqueante a pantalla completa
 *     (check + link a los HTML + Aceptar → `fn_registrar_consentimiento_legal`
 *     con las versiones vigentes → re-query → si queda aviso, encadena notify).
 *   - 'notify'             → modal combinado no bloqueante, una vez por version
 *     (Ver cambios registra 'abierto'; Continuar → `fn_registrar_notificacion_legal`).
 *   - 'none'               → nada.
 *
 * Sin re-chequeo dentro de la sesion tras el cierre (solo al proximo arranque).
 * Error RPC → fail-open (no bloquea; reintenta al proximo arranque).
 * try/catch + async/await (Regla de Oro #13).
 */
export function LegalUpdateGate({ children }: LegalUpdateGateProps) {
  const [estado, setEstado] = useState<LegalEstado | null>(legalEstadoThisSession)
  const [showOverlay, setShowOverlay] = useState(false)
  const [showNotify, setShowNotify] = useState(false)
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [legalDoc, setLegalDoc] = useState<'tyc' | 'privacidad' | null>(null)

  // Tracks whether the gate is currently showing an unresolved pending action.
  // If it unmounts while pending (p.ej. el gate de onboarding reemplaza el
  // arbol), la memoria de sesion se limpia para re-chequear al remontar.
  const pendingRef = useRef(false)

  const applyEstado = (next: LegalEstado | null) => {
    legalEstadoThisSession = next
    setEstado(next)

    if (!next) {
      pendingRef.current = false
      setShowOverlay(false)
      setShowNotify(false)
      return
    }

    const needsAcceptance =
      next.terminos.pending_action === 'require_acceptance' ||
      next.privacidad.pending_action === 'require_acceptance'
    if (needsAcceptance) {
      // El bloqueo tiene precedencia sobre el aviso: primero re-aceptar.
      pendingRef.current = true
      setShowOverlay(true)
      setShowNotify(false)
      return
    }

    const needsNotify =
      next.terminos.pending_action === 'notify' ||
      next.privacidad.pending_action === 'notify'
    pendingRef.current = needsNotify
    setShowOverlay(false)
    setShowNotify(needsNotify)
  }

  const runCheck = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const next = await obtenerEstadoLegal()
      legalEstadoFetchedThisSession = true
      applyEstado(next)
    } catch (err) {
      // Fail-open-on-infra: si el RPC de estado falla, NO bloqueamos la app.
      // El backend es fail-safe (sin evento 'aceptado' => require_acceptance),
      // pero un error de red no debe dejar al usuario fuera de su propia app.
      // Este fallo es de infraestructura, no una via para saltarse el gate: se
      // reintenta en el proximo arranque de la app (la sesion no re-chequea).
      const msg = parseError(err)
      console.error('LegalUpdateGate: error al obtener estado legal (fail-open):', msg)
      legalEstadoFetchedThisSession = true
      applyEstado(null)
    }
  }

  useEffect(() => {
    if (!legalEstadoFetchedThisSession) {
      void runCheck()
    } else {
      // Remount dentro de la misma sesion: re-aplicar el estado cacheado sin
      // pegarle de nuevo a la RPC (memoria de sesion).
      applyEstado(legalEstadoThisSession)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !legalEstadoFetchedThisSession) {
        void runCheck()
      } else if (event === 'SIGNED_OUT') {
        // Otra cuenta puede iniciar sesion en la misma carga de pagina:
        // limpiar la memoria para que el gate vuelva a chequear.
        legalEstadoFetchedThisSession = false
        legalEstadoThisSession = null
        setChecked(false)
        setError(false)
        applyEstado(null)
      }
    })

    return () => {
      subscription.unsubscribe()
      // Si el gate se desmonta con una accion pendiente sin resolver (p.ej. el
      // gate de onboarding toma el arbol durante el arranque), invalidamos la
      // memoria de sesion: al remontar se consulta de nuevo el estado real en
      // vez de repintar un snapshot viejo. Tras una accion resuelta (o 'none')
      // la memoria se conserva y no se re-chequea hasta el proximo arranque.
      if (pendingRef.current) {
        legalEstadoFetchedThisSession = false
        legalEstadoThisSession = null
      }
    }
  }, [])

  const handleAccept = async () => {
    if (!checked || !estado) return
    setLoading(true)
    setError(false)
    try {
      // Sella la version vigente SOLO de los docs que el overlay mostro. Los
      // docs que no piden aceptacion van en null para no saltarse su aviso.
      await registrarConsentimiento({
        terminos:
          estado.terminos.pending_action === 'require_acceptance'
            ? estado.terminos.current_version
            : null,
        privacidad:
          estado.privacidad.pending_action === 'require_acceptance'
            ? estado.privacidad.current_version
            : null,
      })

      // Re-query (§5.2): aceptar puede desbloquear y a la vez dejar un aviso
      // pendiente; si queda 'notify', applyEstado encadena al modal combinado.
      const next = await obtenerEstadoLegal()
      applyEstado(next)
      setChecked(false)
    } catch (err) {
      const msg = parseError(err)
      console.error('LegalUpdateGate: error al registrar consentimiento:', msg)
      // Aceptacion fallida: el overlay sigue bloqueando; el usuario reintenta.
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleNotifyContinue = async () => {
    if (!estado) return
    setLoading(true)
    setError(false)
    try {
      await registrarNotificacionLegal()
      // Sin re-query: la RPC sella la version vigente de ambos docs de forma
      // idempotente. Reflejamos eso en la memoria de sesion para que un remount
      // no vuelva a mostrar un aviso ya sellado.
      applyEstado({
        terminos: {
          ...estado.terminos,
          pending_action:
            estado.terminos.pending_action === 'notify'
              ? 'none'
              : estado.terminos.pending_action,
        },
        privacidad: {
          ...estado.privacidad,
          pending_action:
            estado.privacidad.pending_action === 'notify'
              ? 'none'
              : estado.privacidad.pending_action,
        },
      })
    } catch (err) {
      const msg = parseError(err)
      console.error('LegalUpdateGate: error al registrar notificacion legal:', msg)
      // No bloqueante: el modal queda abierto para reintentar "Continuar".
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const notifyDocs = estado
    ? (['terminos', 'privacidad'] as const).filter(
        (doc) => estado[doc].pending_action === 'notify',
      )
    : []

  return (
    <>
      {children}

      {showOverlay && estado && (
        <div
          className="legal-update-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('legal_update_overlay_title')}
        >
          <div className="legal-update-card">
            <h2 className="legal-update-title">{t('legal_update_overlay_title')}</h2>
            <p className="legal-update-body">{t('legal_update_overlay_body')}</p>

            <ConsentCheckbox
              checked={checked}
              onChange={setChecked}
              disabled={loading}
              onOpenDoc={setLegalDoc}
            />

            {error && <p className="legal-update-error">{t('legal_update_error')}</p>}

            <button
              type="button"
              className="btn btn-primary btn-full btn-lg"
              disabled={!checked || loading}
              onClick={handleAccept}
            >
              {loading ? t('btn_loading') : error ? t('legal_update_retry') : t('legal_update_accept')}
            </button>
          </div>
        </div>
      )}

      {!showOverlay && showNotify && estado && (
        <div
          className="legal-update-notify-overlay"
          role="dialog"
          aria-label={t('legal_update_notify_title')}
        >
          <div className="legal-update-card legal-update-card--notify">
            <h2 className="legal-update-title">{t('legal_update_notify_title')}</h2>
            <p className="legal-update-body">{t('legal_update_notify_summary')}</p>

            <div className="legal-update-links">
              {notifyDocs.map((doc) => (
                <button
                  key={doc}
                  type="button"
                  className="legal-update-link"
                  onClick={() => setLegalDoc(DOC_LINK[doc])}
                >
                  {t(DOC_LABEL_KEY[doc])} · {t('legal_update_view_changes')}
                </button>
              ))}
            </div>

            {error && <p className="legal-update-error">{t('legal_update_error')}</p>}

            <button
              type="button"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
              onClick={handleNotifyContinue}
            >
              {loading ? t('btn_loading') : t('legal_update_continue')}
            </button>
          </div>
        </div>
      )}

      <LegalDocModal
        doc={legalDoc ?? 'tyc'}
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
      />
    </>
  )
}
