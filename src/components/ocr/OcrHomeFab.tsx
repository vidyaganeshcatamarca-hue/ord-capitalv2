// src/components/ocr/OcrHomeFab.tsx
// ============================================
// OCR - FAB de Home con el contador de cuarentena
// ============================================
//
// Mismo patron que VoiceHomeFab: entrada persistente a la cuarentena, visible
// solo con el menu de cuarentena habilitado y con al menos una fila pendiente
// de origen OCR.
//
// Discrimina por `metadata.ocr_job_id` y por `origen === 'ocr'`, igual que Voice
// lo hace con job_id/origen='voz'. Reutiliza los estilos de Voice para que la
// apariencia sea identica; solo cambia la posicion, para apilarse encima.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { rpc } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { useModoApp } from '@/contexts/ModoAppContext'
import '../voice/VoiceHomeFab.css'
import './OcrHomeFab.css'

/** Cada cuanto se refresca el contador, en milisegundos. */
export const OCR_QUARANTINE_POLL_MS = 15000

interface OcrQuarantineRow {
  metadata: { ocr_job_id?: string | null } | null
  origen?: string | null
}

/**
 * Cuenta filas pendientes de origen OCR.
 *
 * `origen = 'ocr'` es autoritativo en datos nuevos; `ocr_job_id` mantiene
 * identificables las filas legacy. Se evalua con OR para no contar dos veces la
 * misma fila.
 */
function countOcrItems(rows: OcrQuarantineRow[]): number {
  return rows.reduce((total, row) => {
    const byOrigin = row?.origen === 'ocr'
    const byJobId = row?.metadata != null && row.metadata.ocr_job_id != null
    return byOrigin || byJobId ? total + 1 : total
  }, 0)
}

export function OcrHomeFab() {
  const navigate = useNavigate()
  const { hasFeature, loading } = useModoApp()
  const [count, setCount] = useState(0)

  // Sin la guarda, el FAB quedaria oculto hasta el primer cambio de estado y la
  // RPC correria incluso para usuarios sin el menu de cuarentena.
  const enabled = !loading && hasFeature('menu_cuarentena')

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const rows = await rpc<OcrQuarantineRow[]>('fn_reporte_cuarentena_pendientes')
        if (cancelled) return
        setCount(countOcrItems(Array.isArray(rows) ? rows : []))
      } catch (err) {
        // Silencioso a proposito: el FAB simplemente no aparece. Avisar en cada
        // tick de 15s seria spam.
        if (!cancelled) console.warn('ocr quarantine count failed:', err)
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, OCR_QUARANTINE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [enabled])

  if (!enabled || count <= 0) return null

  const label = t('ocr.fab_a11y', { count: String(count) })

  return (
    <button
      type="button"
      className="voice-fab ocr-fab"
      onClick={() => navigate('/cuarentena?origen=ocr')}
      aria-label={label}
      title={label}
    >
      <Inbox size={24} stroke="currentColor" strokeWidth={1.8} aria-hidden="true" />
      <span className="voice-fab-badge" aria-hidden="true">{count}</span>
    </button>
  )
}
