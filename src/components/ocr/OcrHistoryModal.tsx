// src/components/ocr/OcrHistoryModal.tsx
// ============================================
// OCR - "Ultimos envios": estado de lo que ya se mando
// ============================================
//
// Un ticket con tres o cuatro fotos puede tardar minutos en volver a
// cuarentena, y el job local desaparece cuando se despacha o se aprueba. Este
// modal lee el historial del telefono (src/ocr/history.ts) para que el dueño
// sepa en que quedo cada envio sin depender de las tablas.
//
// La fila que ya esta en cuarentena es un boton: lleva directo a la bandeja.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import { loadOcrHistory, type OcrHistoryEntry, type OcrHistoryStatus } from '@/ocr/history'
import { describeOcrJobStatus } from '@/ocr/jobStatusLabel'
import './Ocr.css'

interface OcrHistoryModalProps {
  onClose: () => void
}

/** Fecha y hora cortas, en el locale del dispositivo. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: OcrHistoryStatus): string {
  return t(`ocr.history_status_${status}`)
}

export function OcrHistoryModal({ onClose }: OcrHistoryModalProps) {
  const navigate = useNavigate()
  const [entries] = useState<OcrHistoryEntry[]>(() => loadOcrHistory().value)

  const openQuarantine = (): void => {
    onClose()
    navigate('/cuarentena')
  }

  return createPortal(
    <div
      className="ocr-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.history_title')}
    >
      <div className="ocr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ocr-modal-header">
          <h3>{t('ocr.history_title')}</h3>
          <button className="ocr-modal-close" onClick={onClose} aria-label={t('ocr.capture_cancel')}>
            ×
          </button>
        </div>

        <div className="ocr-modal-body">
          {entries.length === 0 ? (
            <p className="ocr-note">{t('ocr.history_empty')}</p>
          ) : (
            <ul className="ocr-history-list">
              {entries.map((entry) => {
                const inQuarantine = entry.status === 'quarantine'
                const Row = inQuarantine ? 'button' : 'div'
                // The real backend state, when the ticket is still travelling.
                // A ten-minute ticket must say "reading" or "classifying", not
                // a flat "processing" that tells the owner nothing.
                const fine = describeOcrJobStatus(entry.last_status ?? null, entry.last_stage ?? null)
                const statusText = fine ? t(fine.key) : statusLabel(entry.status)
                const statusClass = `ocr-history-status ocr-history-status--${entry.status}${
                  fine ? ` ocr-history-status--${fine.tone}` : ''
                }`
                return (
                  <li key={entry.job_id}>
                    <Row
                      {...(inQuarantine
                        ? { type: 'button' as const, onClick: openQuarantine }
                        : {})}
                      className={`ocr-history-row${inQuarantine ? ' ocr-history-row--action' : ''}`}
                    >
                      <span className="ocr-history-date">{formatWhen(entry.created_at)}</span>
                      <span className="ocr-history-images">
                        {t('ocr.history_images', { count: String(entry.image_count) })}
                      </span>
                      <span className={statusClass}>
                        {statusText}
                      </span>
                    </Row>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
