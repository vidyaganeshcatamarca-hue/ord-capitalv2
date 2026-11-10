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
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { rpc } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { useModoApp } from '@/contexts/ModoAppContext'
import './QuarantineHomeFab.css'

/**
 * How often the pending count is refreshed, in milliseconds.
 * Exported so tests can assert against it instead of duplicating the value.
 */
export const QUARANTINE_POLL_MS = 15000

/** Minimal slice of a `fn_reporte_cuarentena_pendientes` row that this FAB reads. */
interface QuarantineRow {
  pendiente_id: number
}

export function QuarantineHomeFab() {
  const navigate = useNavigate()
  const { hasFeature, loading } = useModoApp()
  const [count, setCount] = useState(0)

  // Wait for the feature set to load before trusting `hasFeature`: without the
  // guard the FAB would stay hidden until the first status change lands and the
  // RPC would fire even for users without the quarantine menu.
  const enabled = !loading && hasFeature('menu_cuarentena')

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const rows = await rpc<QuarantineRow[]>('fn_reporte_cuarentena_pendientes')
        if (cancelled) return
        setCount(Array.isArray(rows) ? rows.length : 0)
      } catch (err) {
        // Silent by design: the FAB just stays hidden on failure. Toasting here
        // would fire on every poll tick (every 15s) and spam the user.
        if (!cancelled) console.warn('quarantine count failed:', err)
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, QUARANTINE_POLL_MS)

    return () => {
      // Guards every `setCount` above against running after unmount.
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [enabled])

  if (!enabled || count <= 0) return null

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
