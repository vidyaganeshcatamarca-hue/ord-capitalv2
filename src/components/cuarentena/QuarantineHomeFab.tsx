// src/components/cuarentena/QuarantineHomeFab.tsx
// ============================================
// Single quarantine notice for the Home screen
// ============================================
//
// One entry point for every pending quarantine row, whatever produced it: OCR or
// voice. Before this, Home mounted one FAB per source, each with its own number,
// so two pending tickets showed as two envelopes with "1" instead of one with
// "2" (owner, 2026-11-02).
//
// The count is the whole pending list, because that is exactly what the inbox it
// opens lists, and its tabs already split by origin.
//
// WHEN IT ASKS THE SERVER (owner, 2026-11-11)
// -------------------------------------------
// It used to poll every 15 s for as long as Home was mounted: 1.920 network calls
// in an 8-hour session for a number that only changes when the user sends
// something. Now:
//
//   1. On mount — which also covers "go to Accounts, come back": the router is
//      flat, so leaving Home unmounts this FAB and coming back mounts it again.
//   2. When the tab becomes visible again (phone locked, another app): the route
//      never changed, so the mount above does not run.
//   3. Inside a 5-minute window after the user sends an audio or an OCR ticket,
//      while the result may still be landing. The window stops early once the
//      count shows something, and it never runs while the page is hidden.
//
// Nothing else. No idle polling, no hourly tick.
//
// It also must not delay Home's own data: the first call is deferred to an idle
// callback and only happens once Home reports it finished loading (`listo`).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { rpc } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { useModoApp } from '@/contexts/ModoAppContext'
import {
  hayEnvioReciente,
  msRestantesDeVentana,
  suscribirEnvioCuarentena,
} from '@/lib/quarantineWatch'
import './QuarantineHomeFab.css'

/**
 * How often the pending count is refreshed **while the send window is open**.
 * Exported so tests can assert against it instead of duplicating the value.
 */
export const QUARANTINE_POLL_MS = 15000

/** Minimal slice of a `fn_reporte_cuarentena_pendientes` row that this FAB reads. */
interface QuarantineRow {
  pendiente_id: number
}

interface QuarantineHomeFabProps {
  /**
   * Home finished loading its own data. The count is not requested before this,
   * so the user never waits for the FAB to see their balances and movements.
   */
  listo?: boolean
}

/** Runs `fn` when the browser is idle; falls back to a timeout where it is not available. */
function cuandoHayaLugar(fn: () => void): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, 0)
  return () => window.clearTimeout(id)
}

export function QuarantineHomeFab({ listo = true }: QuarantineHomeFabProps) {
  const navigate = useNavigate()
  const { hasFeature, loading } = useModoApp()
  const [count, setCount] = useState(0)
  // Reads the count without re-running the effect that owns the interval.
  const countRef = useRef(0)

  // Wait for the feature set to load before trusting `hasFeature`: without the
  // guard the FAB would stay hidden until the first status change lands and the
  // RPC would fire even for users without the quarantine menu.
  const enabled = !loading && hasFeature('menu_cuarentena')
  const activo = enabled && listo

  useEffect(() => {
    if (!activo) {
      if (!enabled) {
        countRef.current = 0
        setCount(0)
      }
      return
    }

    let cancelled = false
    let intervalo: number | null = null
    let bajaInactividad: (() => void) | null = null

    const pararIntervalo = () => {
      if (intervalo !== null) {
        window.clearInterval(intervalo)
        intervalo = null
      }
    }

    const load = async () => {
      // Nothing to ask while the tab is hidden: when it comes back, the
      // visibility listener below fires one call.
      if (document.hidden) return
      try {
        const rows = await rpc<QuarantineRow[]>('fn_reporte_cuarentena_pendientes')
        if (cancelled) return
        const total = Array.isArray(rows) ? rows.length : 0
        countRef.current = total
        setCount(total)
        // The result already landed: the window has nothing left to watch.
        if (total > 0) pararIntervalo()
      } catch (err) {
        // Silent by design: the FAB just stays as it was on failure. Toasting
        // here would fire inside the send window and spam the user.
        if (!cancelled) console.warn('quarantine count failed:', err)
      }
    }

    /**
     * Opens the short window that follows a send. A long OCR may take a while to
     * land, so it polls every 15 s, but never past the remaining window and never
     * while hidden.
     */
    const abrirVentana = () => {
      if (cancelled || document.hidden) return
      pararIntervalo()
      const restante = msRestantesDeVentana()
      if (restante <= 0) return
      intervalo = window.setInterval(() => {
        if (document.hidden) return
        if (!hayEnvioReciente()) {
          pararIntervalo()
          return
        }
        void load()
      }, QUARANTINE_POLL_MS)
    }

    // 1) First look, deferred so it does not compete with Home's first paint.
    bajaInactividad = cuandoHayaLugar(() => {
      void load()
      abrirVentana()
    })

    // 2) Back from the background: the route did not change, so nothing remounted.
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        pararIntervalo()
        return
      }
      void load()
      abrirVentana()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    // 3) The user just sent something: check now and keep an eye for 5 minutes.
    const bajaEnvio = suscribirEnvioCuarentena(() => {
      if (cancelled) return
      void load()
      abrirVentana()
    })

    return () => {
      cancelled = true
      bajaInactividad?.()
      bajaEnvio()
      pararIntervalo()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [activo, enabled])

  if (!activo || count <= 0) return null

  const label = t('quarantine.fab_a11y', { count: String(count) })

  return (
    <button
      type="button"
      className="quarantine-fab"
      onClick={() => navigate('/cuarentena')}
      aria-label={label}
      title={label}
    >
      <Inbox size={24} stroke="currentColor" strokeWidth={1.8} aria-hidden="true" />
      <span className="quarantine-fab-badge" aria-hidden="true">{count}</span>
    </button>
  )
}
