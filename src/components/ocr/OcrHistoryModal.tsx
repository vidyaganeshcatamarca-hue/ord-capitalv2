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
//
// Una fila cuyo upload el backend ya no conoce ofrece dos salidas: reenviar las
// mismas fotos o borrarla del historial. Sin eso quedaba "Recibido · En espera"
// para siempre, que es peor que un error visible.

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import { useAuth } from '@/contexts/AuthContext'
import {
  acknowledgeRejectedOcrHistory,
  bumpOcrHistoryRetry,
  canRetryRejectedEntry,
  loadOcrHistory,
  OCR_HISTORY_MAX_MANUAL_RETRIES,
  type OcrHistoryEntry,
  type OcrHistoryStatus,
} from '@/ocr/history'
import { describeOcrJobStatus } from '@/ocr/jobStatusLabel'
import { loadOcrJobs, type StoredOcrJob } from '@/ocr/storage'
import { isLostOcrHistoryEntry } from '@/ocr/recovery'
import './Ocr.css'

interface OcrHistoryModalProps {
  onClose: () => void
  /** Reenvía las fotos guardadas de un envío que el backend ya no conoce. */
  onResend?: (jobId: string) => Promise<void>
  /** Borra del historial un envío descartado. */
  onDiscard?: (jobId: string) => Promise<void>
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

export function OcrHistoryModal({ onClose, onResend, onDiscard }: OcrHistoryModalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entries, setEntries] = useState<OcrHistoryEntry[]>(() => loadOcrHistory().value)
  const [busy, setBusy] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  // The row is lost only when the backend answered NOT_FOUND (or nothing is
  // following it any more). A network failure is not lost: the upload exists.
  const jobs = loadOcrJobs().value

  /*
   * Opening this list IS the acknowledgement: the owner is reading it, so the
   * rejection stops asking for attention. It also makes the row trimmable again
   * -- while unseen, `trimHistory` keeps it no matter how old it is.
   */
  useEffect(() => {
    acknowledgeRejectedOcrHistory()
  }, [])

  /** The stored job for a row, when there is one. */
  const jobOf = (jobId: string): StoredOcrJob | undefined =>
    jobs.find(job => job.job_id === jobId)

  // Two accounts share this phone. A row belongs to whoever uploaded it: the
  // entry records its owner, and the older ones that predate that field are
  // resolved through the job they point at. A row nobody can be attributed to
  // is never shown, because showing it would offer a stranger's ticket.
  const visibleEntries = useMemo(() => {
    const currentOwner = user?.id ?? null
    if (!currentOwner) return entries
    const ownerOf = (entry: OcrHistoryEntry, all: readonly StoredOcrJob[]): string | null => {
      if (entry.owner_user_id) return entry.owner_user_id
      return all.find((job) => job.job_id === entry.job_id)?.owner_user_id ?? null
    }
    return entries.filter((entry) => ownerOf(entry, jobs) === currentOwner)
  }, [entries, jobs, user?.id])

  const openQuarantine = (): void => {
    onClose()
    navigate('/cuarentena')
  }

  /** Counts the attempt and refreshes the rows so the limit shows immediately. */
  const bumpOnce = (jobId: string): number | null => {
    const bumped = bumpOcrHistoryRetry(jobId)
    setEntries(loadOcrHistory().value)
    return bumped === null ? null : bumped.retryCount
  }

  const run = async (
    jobId: string,
    action: ((id: string) => Promise<void>) | undefined
  ): Promise<void> => {
    if (!action || busy !== null) return
    setBusy(jobId)
    setErrorKey(null)
    try {
      await action(jobId)
      // Re-read: both actions change what the phone remembers.
      setEntries(loadOcrHistory().value)
    } catch {
      setErrorKey('ocr.history_action_failed')
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div
      className="ocr-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.history_title')}
    >
      <div className="ocr-modal ocr-modal--history" onClick={(event) => event.stopPropagation()}>
        <div className="ocr-modal-header">
          <h3>{t('ocr.history_title')}</h3>
          <button className="ocr-modal-close" onClick={onClose} aria-label={t('ocr.capture_cancel')}>
            ×
          </button>
        </div>

        <div className="ocr-modal-body">
          {errorKey !== null && <p className="ocr-note ocr-note--warn">{t(errorKey)}</p>}
          {visibleEntries.length === 0 ? (
            <p className="ocr-note">{t('ocr.history_empty')}</p>
          ) : (
            <ul className="ocr-history-list">
              {visibleEntries.map((entry) => {
                const inQuarantine = entry.status === 'quarantine'
                const lost = isLostOcrHistoryEntry(entry, jobs)
                const Row = inQuarantine ? 'button' : 'div'
                // The fine backend state only describes a ticket that is still
                // travelling. Once it sits in the quarantine — or is already
                // approved — the lifecycle status is the truth; a stale
                // `last_status` would keep saying "reading" forever.
                const stillTravelling =
                  entry.status === 'processing' || entry.status === 'classified'
                const fine = stillTravelling
                  ? describeOcrJobStatus(entry.last_status ?? null, entry.last_stage ?? null)
                  : null
                const statusText = lost
                  ? t('ocr.history_lost')
                  : fine
                    ? t(fine.key)
                    : statusLabel(entry.status)
                const statusClass = `ocr-history-status ocr-history-status--${entry.status}${
                  fine && !lost ? ` ocr-history-status--${fine.tone}` : ''
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
                    {entry.status === 'rejected' && (
                      <div className="ocr-history-failed">
                        <p className="ocr-history-failed-text">{t('ocr.job_failed_message')}</p>
                        {onResend !== undefined && (
                          <button
                            type="button"
                            className="ocr-history-action ocr-history-action--retry"
                            disabled={
                              busy !== null ||
                              !canRetryRejectedEntry(entry, jobOf(entry.job_id)?.quarantine_dispatched === true)
                            }
                            onClick={() => {
                              // The counter is bumped BEFORE the resend: if the
                              // upload throws, the attempt still counts, which is
                              // exactly what keeps a broken ticket from being
                              // hammered.
                              const bumped = bumpOnce(entry.job_id)
                              if (bumped === null) return
                              void run(entry.job_id, onResend)
                            }}
                          >
                            {t('ocr.history_retry')}
                          </button>
                        )}
                        {(entry.retry_count ?? 0) >= OCR_HISTORY_MAX_MANUAL_RETRIES && (
                          <p className="ocr-history-failed-limit">
                            {t('ocr.history_retry_limit')}
                          </p>
                        )}
                      </div>
                    )}

                    {lost && (onResend !== undefined || onDiscard !== undefined) && (
                      <div className="ocr-history-actions">
                        {onResend !== undefined && (
                          <button
                            type="button"
                            className="ocr-history-action"
                            disabled={busy !== null}
                            onClick={() => void run(entry.job_id, onResend)}
                          >
                            {t('ocr.history_resend')}
                          </button>
                        )}
                        {onDiscard !== undefined && (
                          <button
                            type="button"
                            className="ocr-history-action ocr-history-action--danger"
                            disabled={busy !== null}
                            onClick={() => void run(entry.job_id, onDiscard)}
                          >
                            {t('ocr.history_discard')}
                          </button>
                        )}
                      </div>
                    )}
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
