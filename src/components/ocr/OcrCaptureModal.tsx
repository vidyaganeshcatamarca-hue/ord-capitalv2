// src/components/ocr/OcrCaptureModal.tsx
// ============================================
// OCR - Capture / upload surface
// ============================================
//
// Normative source: definitive PRD §26-§34, §90-§93 and contract v1 §3-§8.
//
// The modal never blocks on processing: as soon as a `job_id` exists the ticket
// is received and the user is told to keep using ORD (§91). The job keeps being
// followed by the global bridge after this modal is closed (§92).

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/locales/i18n'
import { useOcrContext } from '@/ocr/contextBuilder'
import { useOcrJobsContext } from '@/ocr/OcrJobsProvider'
import {
  MAX_OCR_FILE_BYTES,
  MAX_OCR_IMAGES,
  MAX_OCR_TOTAL_BYTES,
  validateOcrFiles,
} from '@/ocr/contract'
import { ocrFileRejectionI18nKey } from '@/ocr/errors'
import { isOcrPdfFile } from '@/ocr/contract'
import './Ocr.css'

interface OcrCaptureModalProps {
  open: boolean
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/** Status line of a followed job, in the user's language (PRD §35, §36). */
function jobStatusLabel(phase: string): string {
  switch (phase) {
    case 'queued':
      return t('ocr.status_queued_short')
    case 'waiting':
      return t('ocr.status_waiting_for_inference_short')
    case 'classifying':
      return t('ocr.status_classifying_short')
    case 'ready':
    case 'dispatched':
      return t('ocr.status_needs_review_short')
    case 'failed':
      return t('ocr.status_failed_short')
    case 'cancelled':
      return t('ocr.status_cancelled_short')
    case 'processing':
    default:
      return t('ocr.status_processing_short')
  }
}

export function OcrCaptureModal({ open, onClose }: OcrCaptureModalProps) {
  const { submit, jobs } = useOcrJobsContext()
  const { context, loading: contextLoading } = useOcrContext()

  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [errorI18nKey, setErrorI18nKey] = useState<string | null>(null)
  const [stage, setStage] = useState<'idle' | 'sending' | 'accepted'>('idle')
  const [accepted, setAccepted] = useState<{ duplicate: boolean } | null>(null)

  const validation = useMemo(() => validateOcrFiles(files), [files])
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])

  const followedJobs = useMemo(
    () => Object.values(jobs).filter((job) => job.phase !== 'dispatched'),
    [jobs]
  )

  if (!open) return null

  const addFiles = (incoming: FileList | null): void => {
    if (!incoming || incoming.length === 0) return
    setErrorI18nKey(null)
    const next = [...files, ...Array.from(incoming)]
    // The local limit is checked immediately, with the exact reason, so the user
    // never discovers the problem after uploading (§106).
    const check = validateOcrFiles(next)
    if (!check.ok) {
      setErrorI18nKey(ocrFileRejectionI18nKey(check.reason))
      return
    }
    setFiles(next)
  }

  const removeAt = (index: number): void => {
    setFiles((current) => current.filter((_, position) => position !== index))
    setErrorI18nKey(null)
  }

  const move = (index: number, direction: -1 | 1): void => {
    setFiles((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const reset = (): void => {
    setFiles([])
    setErrorI18nKey(null)
    setStage('idle')
    setAccepted(null)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const send = async (): Promise<void> => {
    if (!validation.ok) {
      setErrorI18nKey(ocrFileRejectionI18nKey(validation.reason))
      return
    }
    if (!context) {
      setErrorI18nKey('ocr.error_context_unavailable')
      return
    }
    setStage('sending')
    setErrorI18nKey(null)
    const result = await submit({ files, context })
    if (!result.jobId) {
      setStage('idle')
      setErrorI18nKey(result.errorI18nKey ?? 'ocr.error_upload_failed')
      return
    }
    setAccepted({ duplicate: result.duplicate })
    setStage('accepted')
    setFiles([])
  }

  // Portaled to `document.body`: the sheet is mounted from AppLayout, so a
  // page-scoped stylesheet never reaches it and any ancestor transform would
  // also break a fixed overlay.
  return createPortal(
    <div
      className="ocr-overlay"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.capture_title')}
    >
      <div className="ocr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ocr-modal-header">
          <h3>{t('ocr.capture_title')}</h3>
          <button className="ocr-modal-close" onClick={close} aria-label={t('ocr.capture_cancel')}>
            ×
          </button>
        </div>

        <div className="ocr-modal-body ocr-capture-body">
          {stage === 'accepted' && accepted ? (
            <div className="ocr-received">
              <h4>{t('ocr.capture_received_title')}</h4>
              <p>{t('ocr.capture_received_desc')}</p>
              {accepted.duplicate && <p>{t('ocr.capture_duplicate_note')}</p>}
              <button type="button" className="btn btn-primary" onClick={close}>
                {t('ocr.capture_keep_using')}
              </button>
            </div>
          ) : (
            <>
              <p className="ocr-capture-hint">{t('ocr.capture_hint')}</p>
              <p className="ocr-capture-hint">{t('ocr.capture_limits')}</p>

              <div className="ocr-capture-actions">
                <label className="ocr-file-btn">
                  📷 {t('ocr.capture_take_photo')}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(event) => {
                      addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
                <label className="ocr-file-btn">
                  🖼️ {t('ocr.capture_add_images')}
                  <input
                    ref={galleryRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
                <label className="ocr-file-btn">
                  📄 {t('ocr.capture_add_pdf')}
                  <input
                    ref={pdfRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>

              {files.length > 0 && (
                <>
                  <p className="ocr-note">
                    {t('ocr.capture_files_count', { count: String(files.length) })} ·{' '}
                    {formatBytes(totalBytes)}
                  </p>
                  <ul className="ocr-file-list">
                    {files.map((file, index) => (
                      <li className="ocr-file-row" key={`${file.name}-${index}`}>
                        <span className="ocr-file-index">{index + 1}</span>
                        <span className="ocr-file-name">
                          {file.name || (isOcrPdfFile(file) ? 'PDF' : 'image')}
                        </span>
                        <span className="ocr-file-size">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          className="ocr-icon-btn"
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label={t('ocr.capture_move_up')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="ocr-icon-btn"
                          onClick={() => move(index, 1)}
                          disabled={index === files.length - 1}
                          aria-label={t('ocr.capture_move_down')}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="ocr-icon-btn"
                          onClick={() => removeAt(index)}
                          aria-label={t('ocr.capture_remove')}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {errorI18nKey && <p className="ocr-error">{t(errorI18nKey)}</p>}

              <div className="ocr-capture-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void send()}
                  disabled={
                    stage === 'sending' ||
                    files.length === 0 ||
                    !validation.ok ||
                    contextLoading ||
                    !context
                  }
                >
                  {stage === 'sending' ? t('ocr.capture_sending') : t('ocr.capture_send')}
                </button>
                <button type="button" className="btn" onClick={close}>
                  {t('ocr.capture_cancel')}
                </button>
              </div>

              {contextLoading && <p className="ocr-note">{t('ocr.status_queued')}</p>}
              {!contextLoading && !context && (
                <p className="ocr-note ocr-note--warn">{t('ocr.error_context_unavailable')}</p>
              )}
            </>
          )}

          {followedJobs.length > 0 && (
            <div className="ocr-jobs-list">
              {followedJobs.map((job) => (
                <div className="ocr-job-row" key={job.jobId}>
                  <span>📷 {t('ocr.quarantine_title')}</span>
                  <span
                    className={`ocr-job-status ${
                      job.errorCode ? 'ocr-job-status--error' : ''
                    } ${job.phase === 'waiting' ? 'ocr-job-status--warn' : ''}`}
                  >
                    {job.errorCode ? t('ocr.error_upload_failed') : jobStatusLabel(job.phase)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="ocr-note">
            {MAX_OCR_IMAGES} × {formatBytes(MAX_OCR_FILE_BYTES)} · {formatBytes(MAX_OCR_TOTAL_BYTES)}
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
