// src/components/ocr/OcrCaptureModal.tsx
// ============================================
// OCR - Capture / upload surface
// ============================================
//
// Normative source: definitive PRD §26-§34, §90-§93 and contract v1 §3-§8.
//
// TWO SCREENS AND ONE SUB-STEP. The sheet opens where it always opened: the
// three sources (camera, gallery, PDF). The camera is a SUB-STEP the owner picks
// on purpose, and inside it the captures are one tap from the server -- "Enviar"
// replaced the old "Listo" plus "Enviar" pair, which needed two screens for one
// batch.
//
// The modal never blocks on processing: as soon as a `job_id` exists the ticket
// is received and the user is told to keep using ORD (§91). The job keeps being
// followed by the global bridge after this modal is closed (§92).
//
// The "sending" screen is held for a human minimum (5 s) and bounded by a cap
// (10 s) that RELEASES the sheet instead of freezing it; see `startSend`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { removeOcrHistoryEntry } from '@/ocr/history'
import { removeOcrJob } from '@/ocr/storage'
import { deleteOcrImages, listOcrImages, readOcrImage } from '@/ocr/imageStore'
import { isOcrPdfFile } from '@/ocr/contract'
import { CameraCaptureSurface } from '@/ocr/camera/CameraCaptureSurface'
import type { CameraErrorCode } from '@/ocr/camera/useFramedCamera'
import { OcrHistoryModal } from './OcrHistoryModal'
import './Ocr.css'

interface OcrCaptureModalProps {
  open: boolean
  /**
   * `submitted` means a job was created and the user is dismissing the
   * confirmation: the register sheet is done and must close too.
   * `cancelled` means nothing was sent, so whatever the user had typed
   * behind this sheet has to survive.
   */
  onClose: (reason?: 'cancelled' | 'submitted') => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * How long the "sending" screen is held once the POST has started.
 *
 * The owner never got to read what happened after tapping Enviar: the sheet
 * closed in 1.5 s, faster than the eye reads a line, so the send looked like it
 * had been swallowed. The message now owns the screen for AT LEAST five
 * seconds, and never for more than ten: a fast server is still read, and a slow
 * one releases the phone instead of freezing it in front of a screen that says
 * nothing new.
 *
 * Neither number is a network timeout. The upload is not cancelled at the cap:
 * the provider owns the history row and the photos since BEFORE the POST, so the
 * job keeps moving with the sheet closed (useOcrJobs.ts, `submit`).
 */
const MIN_SENDING_MS = 5000
const MAX_SENDING_MS = 10000

/**
 * Which screen the sheet is on. It is a small machine on purpose:
 *
 *   sources -> camera -> sending -> accepted -> (closed)
 *      ^         |          |
 *      |         |          +--> send_failed -> sending | sources
 *      +-----(back)---------+
 *
 * `sources` is the sheet the owner already knows: camera, gallery, PDF. The
 * camera is a SUB-STEP reached by picking that source, never the first screen,
 * and `sending`/`send_failed`/`accepted` replace the body because the batch is
 * no longer being chosen -- it is on its way or already gone.
 */
type CaptureStage = 'idle' | 'sending' | 'send_failed' | 'accepted'
type CaptureSource = 'sources' | 'camera'

/** Status line of a followed job, in the user's language (PRD §35, §36). */
// El listado inline de jobs se reemplazo por OcrHistoryModal, que lee el
// historial local y sobrevive al despacho y a la aprobacion.

export function OcrCaptureModal({ open, onClose }: OcrCaptureModalProps) {
  const { submit, jobs } = useOcrJobsContext()
  const { context, loading: contextLoading } = useOcrContext()

  const galleryRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [errorI18nKey, setErrorI18nKey] = useState<string | null>(null)
  const [stage, setStage] = useState<CaptureStage>('idle')
  // `send_failed` is not a message glued onto "sending": it is its own state,
  // because a failure must never be described with the words of an upload that
  // is still going. The key comes from `submit` (already i18n) or the generic
  // upload error, and it stays until the owner retries or goes back.
  const [sendFailure, setSendFailure] = useState<string | null>(null)
  // Which of the two screens the sheet is on while nothing is being sent.
  const [source, setSource] = useState<CaptureSource>('sources')
  // While the POST is in flight the batch is frozen: adding, removing or reordering
  // photos mid-send would upload a set the owner did not accept. The lock lives and
  // dies with `sending`, and the bridge keeps following the job from the background
  // once the server has accepted it.
  const locked = stage === 'sending'
  const [accepted, setAccepted] = useState<{ duplicate: boolean } | null>(null)

  const validation = useMemo(() => validateOcrFiles(files), [files])
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])

  const [showHistory, setShowHistory] = useState(false)

  // The camera is a SOURCE the owner picks, never the screen the sheet opens on,
  // and never the only one. This holds the reason the browser refused it (no
  // getUserMedia, a rejected promise, a denied permission, an unsupported
  // device): the surface has nothing left to show, so the sub-step keeps a
  // message and a way back instead of a dead black preview. No other source is
  // substituted automatically -- the owner chooses.
  const [cameraFailure, setCameraFailure] = useState<CameraErrorCode | null>(null)

  // ── Send lifecycle ────────────────────────────────────────────────────────
  // Two timers, two refs and one rule: the message is read before it goes away.
  // `minReached` is flipped by the minimum timer so a FAST answer waits for it
  // and a slow one does not restart anything; `acceptedResult` holds the answer
  // while the minimum is still running; `settled` marks the moment this attempt
  // stops being followed (accepted, failed, released or dismissed) so a late
  // resolution can never touch a sheet that is already gone.
  const minTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minReachedRef = useRef(false)
  const acceptedResultRef = useRef<{ duplicate: boolean } | null>(null)
  const settledRef = useRef(false)

  const clearSendTimers = useCallback((): void => {
    if (minTimerRef.current !== null) {
      clearTimeout(minTimerRef.current)
      minTimerRef.current = null
    }
    if (maxTimerRef.current !== null) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  // ABOVE the early return, like every other hook. Two reasons: the hooks order
  // cannot depend on `open`, and the timers must die with the component rather
  // than with a render -- a minimum timer that survives an unmount is a setState
  // on a dead tree, and the cap timer would call `onClose` on a closed sheet.
  useEffect(() => {
    return () => {
      clearSendTimers()
      settledRef.current = true
    }
  }, [clearSendTimers])

  /**
   * Appends whatever arrived -- a picker selection or the camera's `File[]` --
   * through ONE validation gate.
   *
   * The camera hands back exactly what an `<input type="file">` hands back, so
   * both paths share the same limit check, the same reason message and the same
   * ordering. The photos land in `files`, which is what the thumbnails, the
   * remove/reorder buttons and `submit({ files, context })` already read: the
   * upload path does not know or care where a file came from.
   */
  const addFiles = (incoming: FileList | File[] | null): void => {
    if (!incoming) return
    // `Array.isArray` narrows the two shapes apart: a picker hands back a
    // `FileList`, the camera hands back an array. Both become one array here.
    const picked: File[] = Array.isArray(incoming) ? incoming : Array.from(incoming)
    if (picked.length === 0) return
    setErrorI18nKey(null)
    const next = [...files, ...picked]
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

  // Which row the owner just moved.
  //
  // Camera captures arrive with near-identical automatic names ("17944547078…"),
  // so after a swap the list looked untouched: the numbers traded places but
  // nothing else showed the move had landed, and the owner read it as a broken
  // button. The row that arrives is highlighted briefly instead of carrying a
  // permanent badge, which would make every row look special.
  const [movedIndex, setMovedIndex] = useState<number | null>(null)
  const movedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Bail out only AFTER every hook has run -- state, memos, refs, the send
  // cleanup effect and the moved-row timer included. Returning while the sheet
  // was closed skipped the hooks declared above, so opening it called more hooks
  // than the previous render and React tore the tree down with "Rendered more
  // hooks than during the previous render". The rule that follows from that
  // crash: NO hook may be declared below this line, and this line may never move
  // above one. The sheet renders through a portal, so an early exit here costs
  // nothing.
  if (!open) return null

  const markMoved = (index: number): void => {
    setMovedIndex(index)
    if (movedTimerRef.current !== null) clearTimeout(movedTimerRef.current)
    movedTimerRef.current = setTimeout(() => setMovedIndex(null), 1200)
  }

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= files.length) return
    setFiles((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
    markMoved(target)
  }

  const reset = (): void => {
    clearSendTimers()
    // Nothing this sheet started is followed any more: a resolution that arrives
    // after this must not paint a sheet the owner already left.
    settledRef.current = true
    minReachedRef.current = false
    acceptedResultRef.current = null
    setFiles([])
    setErrorI18nKey(null)
    setSendFailure(null)
    setStage('idle')
    setAccepted(null)
    // Dismissing always lands on the source list, never inside the camera
    // sub-step: the next ticket starts where the owner expects it to.
    setSource('sources')
    // A dismissal must not make the camera unavailable for the NEXT ticket: the
    // record only ever describes one attempt on one device state.
    setCameraFailure(null)
  }

  const close = (): void => {
    // Read the stage BEFORE reset() wipes it: an accepted job is a
    // submission, anything else is a dismissal.
    const reason = stage === 'accepted' ? 'submitted' : 'cancelled'
    reset()
    onClose(reason)
  }

  /**
   * The confirmation, and the moment the batch stops belonging to this sheet.
   *
   * This is the EXISTING panel the selector path always rendered (`ocr-received`
   * below), not a second mechanism: the send is not finished, it was ACCEPTED --
   * the provider wrote the history row, keeps the photos and runs the polling
   * loop, so the sheet can hand the ticket over without losing it. Only ever
   * called with a real `job_id` in hand, because that is the only thing that
   * makes the word "accepted" true.
   */
  const showAccepted = (duplicate: boolean): void => {
    clearSendTimers()
    settledRef.current = true
    minReachedRef.current = false
    acceptedResultRef.current = null
    setAccepted({ duplicate })
    setStage('accepted')
    setFiles([])
  }

  /**
   * Starts a send and holds the "sending" screen for its minimum.
   *
   * The order of events, which is the whole point of this function:
   *   1. the message goes up immediately, before the first byte leaves;
   *   2. a FAST answer waits for `MIN_SENDING_MS`, so the message is readable;
   *   3. a SLOW answer releases the sheet at `MAX_SENDING_MS` and keeps going in
   *      the background -- the upload is never cancelled by a timer;
   *   4. an answer without a `job_id` switches to `send_failed` instead of
   *      leaving "sending" over an upload that already died.
   */
  const startSend = (batch: File[]): boolean => {
    if (batch.length === 0) return false
    // The SAME gate the pickers go through, reason included. A batch that cannot
    // be sent is refused here, before anything leaves the phone.
    const check = validateOcrFiles(batch)
    if (!check.ok) {
      setErrorI18nKey(ocrFileRejectionI18nKey(check.reason))
      return false
    }
    if (!context) {
      setErrorI18nKey('ocr.error_context_unavailable')
      return false
    }

    settledRef.current = false
    minReachedRef.current = false
    acceptedResultRef.current = null
    setErrorI18nKey(null)
    setSendFailure(null)
    setStage('sending')
    // The batch is on its way, so the sheet is no longer choosing a source. If
    // the send fails and the owner cancels, he lands on the source list with the
    // batch in it -- not inside a camera that already gave its pages away.
    setSource('sources')

    minTimerRef.current = setTimeout(() => {
      minTimerRef.current = null
      minReachedRef.current = true
      const result = acceptedResultRef.current
      if (result !== null) showAccepted(result.duplicate)
    }, MIN_SENDING_MS)

    maxTimerRef.current = setTimeout(() => {
      maxTimerRef.current = null
      // The cap. Without an answer there is nothing true to confirm, so the
      // sheet is released instead of frozen: the provider already owns the row
      // and the photos, and the history shows the upload while it lands.
      if (acceptedResultRef.current !== null) return
      settledRef.current = true
      clearSendTimers()
      reset()
      onClose('submitted')
    }, MAX_SENDING_MS)

    // `submit` keeps running after this component is gone: it lives in the
    // provider, and the row it wrote is what the history shows as "Sending".
    void submit({ files: batch, context })
      .then((result) => {
        if (settledRef.current) return
        if (!result.jobId) {
          // An upload that already failed must never keep saying "sending".
          clearSendTimers()
          settledRef.current = true
          setSendFailure(result.errorI18nKey ?? 'ocr.error_upload_failed')
          setStage('send_failed')
          return
        }
        acceptedResultRef.current = { duplicate: result.duplicate }
        // A fast server still owes the owner the full minimum on screen: the
        // minimum timer is what shows the confirmation in that case.
        if (minReachedRef.current) showAccepted(result.duplicate)
      })
      .catch(() => {
        if (settledRef.current) return
        clearSendTimers()
        settledRef.current = true
        setSendFailure('ocr.error_upload_failed')
        setStage('send_failed')
      })

    return true
  }

  /** "Enviar ticket" on the source list and "Reintentar" after a failure: one
   *  path, the batch already in `files`. */
  const send = (): void => {
    startSend(files)
  }

  /**
   * "Enviar" on the camera surface.
   *
   * The captures ARE the batch, so they go through the same gate and the same
   * submit as a picker selection: one tap doing what "Listo" followed by
   * "Enviar" used to need two screens for. Nothing bypasses `submit`.
   */
  const sendFromCamera = (shots: File[]): void => {
    if (shots.length === 0) return
    const batch = [...files, ...shots]
    const check = validateOcrFiles(batch)
    if (!check.ok) {
      // Shown on the camera surface, right above its send button: the reason the
      // tap did nothing belongs where the tap happened.
      setErrorI18nKey(ocrFileRejectionI18nKey(check.reason))
      return
    }
    // Only committed once the send actually started. A send that never left
    // (no context yet) leaves the shots on the surface, where they still are:
    // copying them into `files` first would upload them twice on the next tap.
    if (!startSend(batch)) return
    // Kept in state so a failed send can be retried and trimmed without going
    // back to a camera that no longer holds the pages.
    setFiles(batch)
  }

  /**
   * Back to the source list from the camera sub-step.
   *
   * Nothing is lost either way: the shots travel with the callback, so pages
   * already taken join the batch instead of dying with the preview, and the
   * files picked before entering the camera were never touched.
   */
  const backToSources = (shots: File[] = []): void => {
    if (shots.length > 0) addFiles(shots)
    setSource('sources')
  }

  /**
   * Drops an upload the backend no longer knows about.
   *
   * The history row is what the owner sees; the job and its photos are what the
   * phone kept. Leaving either behind means the row comes back on the next
   * open, which is the state this action exists to end.
   */
  const discardHistoryEntry = async (jobId: string): Promise<void> => {
    removeOcrHistoryEntry(jobId)
    removeOcrJob(jobId)
    await deleteOcrImages(jobId)
  }

  /**
   * Re-uploads the photos already stored for a lost ticket.
   *
   * Nothing is invented: if the phone no longer has the images, the action
   * fails instead of sending an empty ticket. The old row and its photos are
   * dropped only after a new job was accepted, so a failed resend leaves the
   * owner exactly where they were.
   */
  const resendHistoryEntry = async (jobId: string): Promise<void> => {
    const stored = await listOcrImages(jobId)
    const usable = stored
      .filter((image) => image.available)
      .sort((a, b) => a.file_index - b.file_index)
    const files: File[] = []
    for (const image of usable) {
      const blob = await readOcrImage(jobId, image.file_index)
      if (!blob) continue
      files.push(new File([blob], `ticket-${image.file_index + 1}`, { type: image.mime_type }))
    }
    if (files.length === 0 || context === null) {
      throw new Error('OCR_HISTORY_RESEND_UNAVAILABLE')
    }
    const result = await submit({ files, context })
    if (!result.jobId) throw new Error('OCR_HISTORY_RESEND_FAILED')
    removeOcrHistoryEntry(jobId)
    await deleteOcrImages(jobId)
  }

  // Whether the camera source can be attempted at all. This is the ONE thing
  // that can be known before touching the stream; every other refusal (a
  // rejected promise, a denied permission, an unsupported device) arrives from
  // the surface itself and lands in `cameraFailure`. Both outcomes have the
  // same shape -- no camera block, no dead preview, the sheet's own sources
  // untouched -- and differ only in the wording of that single line.
  const cameraSourceAvailable =
    cameraFailure === null &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia !== undefined

  // A denied permission is the one refusal the owner can undo, so it keeps its
  // own message; everything else is the plain "no camera here" line.
  const cameraUnavailableKey =
    cameraFailure === 'permission_denied'
      ? 'ocr.camera_error_permission_denied'
      : 'ocr.camera_unavailable'

  // Portaled to `document.body`: the sheet is mounted from AppLayout, so a
  // page-scoped stylesheet never reaches it and any ancestor transform would
  // also break a fixed overlay.

  // The camera SUB-STEP is the one screen that needs the whole sheet: inside it
  // the preview yields height, so the sheet must be tall and not a floating card
  // with the page showing behind. The modifier only exists while that sub-step is
  // the one on screen AND there is a stream to fill it, so the source list, the
  // sending panels and the "no camera here" message keep the sheet they already
  // had (see the phone block in Ocr.css).
  const cameraStep = source === 'camera' && stage === 'idle' && cameraSourceAvailable

  return createPortal(
    <div
      className="ocr-overlay"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.capture_title')}
    >
      <div
        className={cameraStep ? 'ocr-modal ocr-modal--camera' : 'ocr-modal'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ocr-modal-header">
          <h3>{t('ocr.capture_title')}</h3>
          <button className="ocr-modal-close" onClick={close} aria-label={t('ocr.capture_cancel')}>
            ×
          </button>
        </div>

        <div
          className={
            cameraStep
              ? 'ocr-modal-body ocr-capture-body ocr-capture-body--camera'
              : 'ocr-modal-body ocr-capture-body'
          }
        >
          {stage === 'accepted' && accepted ? (
            <div className="ocr-received">
              <h4>{t('ocr.capture_received_title')}</h4>
              <p>{t('ocr.capture_received_desc')}</p>
              {accepted.duplicate && <p>{t('ocr.capture_duplicate_note')}</p>}
              <button type="button" className="btn btn-primary" onClick={close}>
                {t('ocr.capture_keep_using')}
              </button>
            </div>
          ) : stage === 'sending' ? (
            /* The message the owner never got to see. It stands alone on
               purpose: no batch list, no second action, nothing to tap by
               mistake while the upload is starting. It is not progress -- it
               reports what is happening and nothing more, which is exactly
               what can be known at this point. */
            <div className="ocr-sending" role="status" aria-live="polite">
              <p className="ocr-sending-title">{t('ocr.capture_sending')}</p>
              <span className="ocr-sending-bar" aria-hidden="true" />
            </div>
          ) : stage === 'send_failed' ? (
            /* A failed upload says so here, in the words of the failure, and
               keeps the batch: retrying is one tap, and nothing was created on
               the server for this ticket. */
            <div className="ocr-sending">
              <p className="ocr-error" role="alert">
                {t(sendFailure ?? 'ocr.error_upload_failed')}
              </p>
              <div className="ocr-capture-actions">
                <button
                  type="button"
                  className="btn btn-primary ocr-action-btn"
                  onClick={() => void send()}
                  disabled={files.length === 0 || !validation.ok || contextLoading || !context}
                >
                  {t('ocr.capture_retry')}
                </button>
                <button
                  type="button"
                  className="btn ocr-action-btn"
                  onClick={() => {
                    // Back to the list with the batch intact and the reason still
                    // on screen: the operator trims it there, or closes the
                    // sheet. The message is what the list's own error line
                    // shows, so nothing has to be retyped or re-explained.
                    setErrorI18nKey(sendFailure)
                    setStage('idle')
                    setSendFailure(null)
                    setSource('sources')
                  }}
                >
                  {t('ocr.capture_cancel')}
                </button>
              </div>
            </div>
          ) : source === 'camera' ? (
            /* The camera SUB-STEP: it appears only after the owner picked that
               source, and it appears alone -- no gallery, no PDF, no hint about
               other options. The surface's own "Volver" is the way out, and it
               returns to the list with whatever was already chosen. When the
               device has no camera there is a message and the same way back,
               never a dead preview. */
            <div className="ocr-capture-camera">
              {cameraSourceAvailable ? (
                <CameraCaptureSurface
                  variant="screen"
                  onClose={backToSources}
                  maxCaptures={Math.max(1, MAX_OCR_IMAGES - files.length)}
                  errorMessage={errorI18nKey === null ? null : t(errorI18nKey)}
                  onSend={sendFromCamera}
                  onUnavailable={(reason) => setCameraFailure(reason)}
                />
              ) : (
                <>
                  <p className="ocr-note">{t(cameraUnavailableKey)}</p>
                  <button
                    type="button"
                    className="btn btn-outline btn-full"
                    onClick={() => backToSources()}
                  >
                    {t('ocr.camera_back')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="ocr-capture-hint">{t('ocr.capture_hint')}</p>
              <p className="ocr-capture-hint">{t('ocr.capture_limits')}</p>

              <div className="ocr-capture-sources">
                {/* The camera source opens the framed surface as a sub-step.
                    It is a button, not a file input: the capture happens on the
                    product's own screen, where the framing, the travel meter
                    and the thumbnail strip live -- and where "Enviar" is one
                    tap away from the first photo. */}
                <button
                  type="button"
                  className="ocr-file-btn"
                  onClick={() => {
                    setErrorI18nKey(null)
                    setSource('camera')
                  }}
                  disabled={locked}
                >
                  📷 {t('ocr.capture_take_photo')}
                </button>
                <label className="ocr-file-btn" aria-disabled={locked || undefined}>
                  🖼️ {t('ocr.capture_add_images')}
                  <input
                    ref={galleryRef}
                    type="file"
                    disabled={locked}
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
                <label className="ocr-file-btn" aria-disabled={locked || undefined}>
                  📄 {t('ocr.capture_add_pdf')}
                  <input
                    ref={pdfRef}
                    type="file"
                    disabled={locked}
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
                      <li
                        className={
                          movedIndex === index
                            ? 'ocr-file-row ocr-file-row--moved'
                            : 'ocr-file-row'
                        }
                        key={`${file.name}-${index}`}
                      >
                        <span className="ocr-file-index">{index + 1}</span>
                        <span className="ocr-file-name">
                          {file.name || (isOcrPdfFile(file) ? 'PDF' : 'image')}
                        </span>
                        <span className="ocr-file-size">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          className="ocr-icon-btn"
                          onClick={() => move(index, -1)}
                          disabled={locked || index === 0}
                          aria-label={t('ocr.capture_move_up')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="ocr-icon-btn"
                          onClick={() => move(index, 1)}
                          disabled={locked || index === files.length - 1}
                          aria-label={t('ocr.capture_move_down')}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="ocr-icon-btn"
                          onClick={() => removeAt(index)}
                          disabled={locked}
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
                  className="btn btn-primary ocr-action-btn"
                  onClick={() => void send()}
                  disabled={
                    files.length === 0 || !validation.ok || contextLoading || !context
                  }
                >
                  {t('ocr.capture_send')}
                </button>
                <button type="button" className="btn ocr-action-btn" onClick={close}>
                  {t('ocr.capture_cancel')}
                </button>
              </div>

              {contextLoading && <p className="ocr-note">{t('ocr.status_queued')}</p>}
              {!contextLoading && !context && (
                <p className="ocr-note ocr-note--warn">{t('ocr.error_context_unavailable')}</p>
              )}
            </>
          )}

          <button
            type="button"
            className="ocr-history-trigger"
            onClick={() => setShowHistory(true)}
          >
            <span>📷 {t('ocr.history_title')}</span>
            <span aria-hidden="true">›</span>
          </button>

          {showHistory && (
            <OcrHistoryModal
              onClose={() => setShowHistory(false)}
              onResend={resendHistoryEntry}
              onDiscard={discardHistoryEntry}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
