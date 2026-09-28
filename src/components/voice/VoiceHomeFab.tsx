// src/components/voice/VoiceHomeFab.tsx
// ============================================
// Voice v1 - Home FAB with the pending-quarantine counter
// ============================================
// Persistent entry point into the voice quarantine. It only renders when the
// quarantine menu feature is enabled AND there is at least one pending
// voice-originated movement, so the user always has a visible count of what is
// waiting for review.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { rpc } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { useModoApp } from '@/contexts/ModoAppContext'
import './VoiceHomeFab.css'

/**
 * How often the pending voice-quarantine count is refreshed, in milliseconds.
 * Exported so tests can assert against it instead of duplicating the value.
 */
export const VOICE_QUARANTINE_POLL_MS = 15000

/**
 * Minimal slice of a `fn_reporte_cuarentena_pendientes` row that this FAB reads.
 *
 * `metadata.job_id` is the discriminator for voice rows. `origen = 'voz'`
 * is authoritative in new data; job_id keeps legacy rows identifiable.
 */
interface VoiceQuarantineRow {
  metadata: { job_id?: string | null } | null
}

/** Counts pending rows that carry a voice job id in their metadata. */
function countVoiceItems(rows: VoiceQuarantineRow[]): number {
  return rows.reduce(
    (total, row) => (row?.metadata != null && row.metadata.job_id != null ? total + 1 : total),
    0
  )
}

export function VoiceHomeFab() {
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
        const rows = await rpc<VoiceQuarantineRow[]>('fn_reporte_cuarentena_pendientes')
        if (cancelled) return
        setCount(countVoiceItems(Array.isArray(rows) ? rows : []))
      } catch (err) {
        // Silent by design: the FAB just stays hidden on failure. Toasting here
        // would fire on every poll tick (every 15s) and spam the user.
        if (!cancelled) console.warn('voice quarantine count failed:', err)
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, VOICE_QUARANTINE_POLL_MS)

    return () => {
      // Guards every `setCount` above against running after unmount.
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [enabled])

  if (!enabled || count <= 0) return null

  const label = t('voice.fab_a11y', { count })

  return (
    <button
      type="button"
      className="voice-fab"
      onClick={() => navigate('/cuarentena?origen=voz')}
      aria-label={label}
      title={label}
    >
      <Inbox size={24} stroke="currentColor" strokeWidth={1.8} aria-hidden="true" />
      <span className="voice-fab-badge" aria-hidden="true">{count}</span>
    </button>
  )
}
