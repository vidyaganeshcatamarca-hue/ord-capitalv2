/**
 * VoiceRecorderModal — Voice v1
 * Full-screen press-and-hold recorder: opening the modal starts the capture,
 * releasing the button before 30s sends the audio, and the 30s hard cut never
 * sends anything (owner decision: only "record again" is offered).
 *
 * Structure on purpose, split in three:
 *   - `VoiceRecorderModal` lazily arms the feature on first open.
 *   - `VoiceJobBridge` owns `useVoiceJobs` and stays mounted once armed, so an
 *     upload in flight survives closing the modal (the job stays persisted in
 *     localStorage for the global resume/notification flow) and completion is
 *     still reported.
 *   - `VoiceRecorderSession` mounts only while open, so the MediaRecorder hook
 *     is always torn down on close and can never keep recording in the dark.
 *
 * The modal is self-contained: mounting it globally is a later stage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { t } from '@/locales/i18n'
import { telemetry, TELEMETRY_PRIORITY } from '@/lib/telemetry'
import { AUDIO_HARD_CUT_GRACE_MS, MAX_AUDIO_DURATION_MS } from '@/voice/contract'
import { mapVoiceErrorToI18nKey } from '@/voice/errors'
import { RESUME_WINDOW_MS } from '@/voice/storage'
import { useVoiceJobs } from '@/voice/useVoiceJobs'
import type { VoiceJobState } from '@/voice/useVoiceJobs'
import { useVoiceQuarantine } from '@/voice/useVoiceQuarantine'
import { useVoiceRecorder } from '@/voice/useVoiceRecorder'
import type { VoiceMovement } from '@/voice/types'
import { VoiceCountdown } from './VoiceCountdown'
import { VoiceRecorderButton } from './VoiceRecorderButton'
import './VoiceRecorderModal.css'

export interface VoiceRecorderModalProps {
  open: boolean
  onClose: () => void
}

/** Highest duration the recorder accepts, in seconds. */
const TOTAL_SECONDS = Math.floor((MAX_AUDIO_DURATION_MS - AUDIO_HARD_CUT_GRACE_MS) / 1000)

/** Job phases still owned by the modal (upload or backend processing). */
const IN_FLIGHT_PHASES: readonly string[] = ['uploading', 'queued', 'processing']

function isInFlight(job: VoiceJobState): boolean {
  return IN_FLIGHT_PHASES.includes(job.phase)
}

function latestInFlightJob(jobs: Record<string, VoiceJobState>): VoiceJobState | null {
  let latest: VoiceJobState | null = null
  for (const job of Object.values(jobs)) {
    if (!isInFlight(job)) continue
    if (!latest || job.createdAt > latest.createdAt) latest = job
  }
  return latest
}

/** Localized progress label: upload first, then the stage reported by polling. */
function progressLabel(job: VoiceJobState | null): string {
  if (!job) return t('voice.uploading')
  if (job.phase === 'queued') return t('voice.queued')
  if (job.phase === 'processing') {
    // The backend can park a job in `retry_wait` for up to ~60s: a distinct
    // label tells the user the service is retrying instead of looking stuck.
    if (job.status === 'retry_wait') return t('voice.retry_wait')
    switch (job.stage) {
      case 'transcribing':
        return t('voice.transcribing')
      case 'interpreting':
        return t('voice.interpreting')
      case 'finalizing':
        return t('voice.finalizing')
      default:
        return t('voice.processing')
    }
  }
  return t('voice.uploading')
}

interface VoiceJobBridgeProps {
  open: boolean
  onClose: () => void
}

/**
 * Keeps the voice job store alive across open/close so uploads are never
 * orphaned, and reports job outcomes through the global toast.
 */
function VoiceJobBridge({ open, onClose }: VoiceJobBridgeProps) {
  const { showToast } = useToast()
  const { jobs, submit, retryLastSubmit, resumePending, abandonInFlightJobs , reloadVoiceContext } = useVoiceJobs()
  const { loading: loadSaving, loadQuarantine, refresh } = useVoiceQuarantine()

  const [failedJob, setFailedJob] = useState<VoiceJobState | null>(null)
  // Set when the completed job could not be handed to the quarantine, so the
  // modal offers a retry instead of closing and losing the movements.
  const [loadFailed, setLoadFailed] = useState(false)
  const loadFailedRef = useRef<{ jobId: string; movements: VoiceMovement[] } | null>(null)
  // Outcome keys already reported to the user, so a re-render never toasts
  // twice. Now a Set: sending several audios back to back is the normal flow,
  // so several jobs can be in flight (and complete) at once.
  const handledRef = useRef<Set<string>>(new Set())
  // Timestamp of the last transition to `hidden`: measures how long the app
  // stayed backgrounded before deciding resume vs. abandon on return.
  const hiddenAtRef = useRef<number | null>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const inFlightJob = useMemo(() => latestInFlightJob(jobs), [jobs])

  useEffect(() => {
    if (open) reloadVoiceContext()
  }, [open, reloadVoiceContext])

  // Owner bug-8: categories (and wallets/cards) created after the bridge
  // mounted never reached the voice context snapshot. Refresh it every time
  // the modal opens so new entries are in the context without an app restart.

  // Coming back to the foreground: jobs still inside the resume window restart
  // their polling; jobs that stayed hidden longer than that are dead for the
  // user and are closed locally. Going hidden needs no action: the pollers keep
  // running and the telemetry layer flushes its own queue on the same event.
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      resumePending()
      if (hiddenAt === null || Date.now() - hiddenAt <= RESUME_WINDOW_MS) return
      for (const jobId of abandonInFlightJobs()) {
        telemetry.track('voice_job_abandoned', { job_id: jobId }, TELEMETRY_PRIORITY.LOW)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [resumePending, abandonInFlightJobs])

  useEffect(() => {
    // Every job is swept on each store change: with the modal closing on send,
    // an older job can complete after a newer one and must still be reported
    // exactly once (the `handledRef` key is per job and per outcome).
    for (const job of Object.values(jobs)) {
      if (job.phase === 'completed') {
        const key = `completed:${job.jobId}`
        if (handledRef.current.has(key)) continue
        handledRef.current.add(key)
        setFailedJob(null)
        const jobId = job.jobId
        const movements = job.result?.movements ?? []
        // An empty result is a valid outcome, but nothing reaches the quarantine:
        // a success toast would promise a movement that does not exist.
        if (movements.length === 0) {
          // The modal is usually already closed by now (early close on accept);
          // if the user reopened it to record a new note, a completion must not
          // rip it away mid-recording. The toast is the whole notification.
          showToast(t('voice.empty_result'), 'info')
          continue
        }
        // The movements reach the quarantine before the success toast: a failed
        // hand-off must never look like a successful load.
        void (async () => {
          const ok = await loadQuarantine(jobId, movements)
          if (!ok) {
            telemetry.track('voice_load_quarantine_failed', { job_id: jobId }, TELEMETRY_PRIORITY.HIGH)
            loadFailedRef.current = { jobId, movements }
            setLoadFailed(true)
            showToast(t('voice_load_failed'), 'error')
            return
          }
          showToast(t('voice.sent'), 'success')
          // The rows are in the DB now (loadQuarantine verified): quarantine
          // views reload so the item shows up without re-navigating.
          window.dispatchEvent(new CustomEvent('voice-quarantine-landed'))
          // No auto-close: with the modal closed the guard is a no-op, and if
          // the user reopened it to record, completion must not close it
          // mid-recording. Toast + FAB are the notification.
        })()
        continue
      }

      if (job.phase === 'failed') {
        const errorCode = job.errorCode ?? 'UNKNOWN'
        const key = `failed:${job.jobId}:${errorCode}`
        if (handledRef.current.has(key)) continue
        handledRef.current.add(key)
        if (errorCode === 'TIMEOUT') {
          // Local processing deadline: retrying would only reuse the same job,
          // so the user is pushed back to the recorder instead.
          showToast(t('voice.voice_job_timeout'), 'error')
        } else if (errorCode !== 'NETWORK') {
          showToast(t(mapVoiceErrorToI18nKey(errorCode)), 'error')
        } else if (!open) {
          // Transport drop with the modal closed would otherwise be invisible:
          // the user believes the audio is still processing. With the modal
          // open it stays silent on purpose (the send_error view is the feedback).
          showToast(t(mapVoiceErrorToI18nKey(errorCode)), 'error')
        }
        // Only the mounted modal can render the error view; when it is closed
        // the toast above is the notification, and setting it here would hijack
        // the next open (the user reopening to record would see a stale error).
        if (open) setFailedJob(job)
        continue
      }

      if (job.phase === 'abandoned') {
        const key = `abandoned:${job.jobId}`
        if (handledRef.current.has(key)) continue
        handledRef.current.add(key)
        // The job died while the app was backgrounded past the resume window. The
        // quarantine may or may not have received the movements (the FAB polling
        // is the source of truth), so only bother the user when the modal is up.
        if (open) showToast(t('voice.voice_job_timeout'), 'error')
      }
    }
  }, [jobs, open, showToast, loadQuarantine])

  const clearFailure = useCallback((): void => {
    setFailedJob(null)
    setLoadFailed(false)
    loadFailedRef.current = null
  }, [])

  // The backend accepted the upload: the user does not wait for the result. The
  // bridge keeps polling (it outlives the modal) and reports the outcome, so the
  // modal can close as soon as the job exists. `voice_sent` is tracked by the
  // store itself, right before this callback runs.
  const handleAccepted = useCallback((): void => {
    showToast(t('voice.processing_bg'), 'info')
    if (open) onCloseRef.current()
  }, [showToast, open])

  const retry = useCallback((): void => {
    // Re-arms the reporting key for this job so a second failure is reported again.
    const jobId = failedJob?.jobId
    const errorCode = failedJob?.errorCode ?? 'UNKNOWN'
    if (jobId) handledRef.current.delete(`failed:${jobId}:${errorCode}`)
    setFailedJob(null)
    void (async () => {
      const acceptedJobId = await retryLastSubmit()
      if (acceptedJobId) handleAccepted()
    })()
  }, [retryLastSubmit, failedJob, handleAccepted])

  const retryLoad = useCallback(async (): Promise<void> => {
    const pending = loadFailedRef.current
    if (!pending) return
    const ok = await refresh(pending.jobId, pending.movements)
    if (!ok) {
      telemetry.track('voice_load_quarantine_failed', { job_id: pending.jobId }, TELEMETRY_PRIORITY.HIGH)
      showToast(t('voice_load_failed'), 'error')
      return
    }
    loadFailedRef.current = null
    setLoadFailed(false)
    showToast(t('voice.sent'), 'success')
    window.dispatchEvent(new CustomEvent('voice-quarantine-landed'))
    if (open) onCloseRef.current()
  }, [refresh, showToast, open])

  if (!open) return null

  return (
    <VoiceRecorderSession
      inFlightJob={inFlightJob}
      failedJob={failedJob}
      loadFailed={loadFailed}
      loadSaving={loadSaving}
      onRetryLoad={retryLoad}
      submit={submit}
      retry={retry}
      clearFailure={clearFailure}
      onAccepted={handleAccepted}
      onClose={onClose}
    />
  )
}

interface VoiceRecorderSessionProps {
  inFlightJob: VoiceJobState | null
  failedJob: VoiceJobState | null
  loadFailed: boolean
  loadSaving: boolean
  onRetryLoad: () => void
  /** Resolves to the accepted job id, or null when nothing was accepted. */
  submit: (blob: Blob, signal: AbortSignal) => Promise<string | null>
  retry: () => void
  clearFailure: () => void
  onAccepted: () => void
  onClose: () => void
}

/** Recorder UI. Mounts only while the modal is open, so closing always tears the capture down. */
function VoiceRecorderSession({
  inFlightJob,
  failedJob,
  loadFailed,
  loadSaving,
  onRetryLoad,
  submit,
  retry,
  clearFailure,
  onAccepted,
  onClose,
}: VoiceRecorderSessionProps) {
  const { state, remainingSeconds, blob, autoStopped, error, start, stop, cancel } =
    useVoiceRecorder()

  const [tooLong, setTooLong] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const lastSubmittedBlobRef = useRef<Blob | null>(null)
  // Lets the X abort the upload instead of leaving it running in the dark.
  const uploadAbortRef = useRef<AbortController | null>(null)

  // Auto-start on open, same as the legacy recorder.
  useEffect(() => {
    void start()
  }, [start])

  // The Session only exists while the modal is open, so mounting it is one open.
  useEffect(() => {
    telemetry.track('voice_recorder_opened', {}, TELEMETRY_PRIORITY.LOW)
  }, [])

  // Release before 30s: send. Hard cut at 30s: never send (owner decision).
  useEffect(() => {
    if (state !== 'recorded' || !blob) return
    if (autoStopped) {
      setTooLong(true)
      return
    }
    if (lastSubmittedBlobRef.current === blob) return
    lastSubmittedBlobRef.current = blob
    telemetry.track('voice_recorded', {}, TELEMETRY_PRIORITY.MEDIUM)
    setSubmitted(true)
    // The modal only waits for the upload. Once the backend accepts the job it
    // closes and the bridge takes over the result reporting.
    const controller = new AbortController()
    uploadAbortRef.current = controller
    void (async () => {
      const jobId = await submit(blob, controller.signal)
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null
      if (jobId) onAccepted()
    })()
  }, [state, blob, autoStopped, submit, onAccepted])

  const handlePressStart = useCallback(() => {
    // The modal auto-starts on open: this only matters after a reset.
    if (state === 'idle') void start()
  }, [state, start])

  const handlePressEnd = useCallback(() => {
    if (state !== 'recording') return
    // Manual stop: `autoStopped` stays false, so the blob is sent.
    stop()
  }, [state, stop])

  const handleClose = useCallback(() => {
    // Closing during the upload cancels it: the store drops the local job and
    // nothing is reported for an upload the user gave up on.
    uploadAbortRef.current?.abort()
    cancel()
    onClose()
  }, [cancel, onClose])

  const handleRecordAgain = useCallback(() => {
    // Discards the cut blob and returns to a ready-to-record state.
    lastSubmittedBlobRef.current = null
    clearFailure()
    setSubmitted(false)
    setTooLong(false)
    cancel()
  }, [cancel, clearFailure])

  // ── Render state ────────────────────────────────────────────────────────
  const requestingPermission = state === 'requesting_permission'
  const recording = state === 'recording'
  const ownSubmit = submitted || state === 'recorded'

  const view: 'error' | 'too_long' | 'load_error' | 'send_error' | 'sending' | 'recording' | 'idle' = error
    ? 'error'
    : tooLong
      ? 'too_long'
      : loadFailed
        ? 'load_error'
        : failedJob
          ? 'send_error'
          : ownSubmit
            ? 'sending'
            : recording || requestingPermission
              ? 'recording'
              : inFlightJob
                ? 'sending'
                : 'idle'

  const canCloseFromOverlay =
    view === 'idle' || view === 'too_long' || view === 'send_error' || view === 'error'

  const progressJob = inFlightJob
  const sendErrorMessage = failedJob?.errorCode
    ? t(mapVoiceErrorToI18nKey(failedJob.errorCode))
    : t('voice_generic_error')

  return (
    <>
      <div
        className="voice-recorder-overlay"
        onClick={canCloseFromOverlay ? handleClose : undefined}
      />
      <div
        className="voice-recorder-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('voice.title')}
      >
        <div className="voice-recorder-header">
          <h2 className="voice-recorder-title">{t('voice.title')}</h2>
          <button
            type="button"
            className="voice-recorder-close"
            onClick={handleClose}
            aria-label={t('voice.close')}
          >
            ✕
          </button>
        </div>

        <div className="voice-recorder-body">
          {view === 'error' && error && (
            <div className="voice-recorder-block">
              <p className="voice-recorder-alert">{t(error.i18nKey)}</p>
              {error.retryable && (
                <button
                  type="button"
                  className="voice-recorder-action"
                  onClick={() => {
                    void start();
                  }}
                >
                  {t('btn_retry')}
                </button>
              )}
              <button
                type="button"
                className={`voice-recorder-action${error.retryable ? ' is-secondary' : ''}`}
                onClick={handleClose}
              >
                {t('voice.close')}
              </button>
            </div>
          )}

          {view === 'too_long' && (
            <div className="voice-recorder-block">
              {/* Nothing was sent: the only action is a fresh recording. */}
              <p className="voice-recorder-alert">{t('voice_audio_too_long')}</p>
              <p className="voice-recorder-note">{t('voice.not_sent_hint')}</p>
              <button type="button" className="voice-recorder-action" onClick={handleRecordAgain}>
                {t('voice.record_again')}
              </button>
            </div>
          )}

          {view === 'recording' && (
            <div className="voice-recorder-block">
              <VoiceCountdown secondsRemaining={remainingSeconds} total={TOTAL_SECONDS} />
              <p className="voice-recorder-status">
                {requestingPermission ? t('voice.mic_request') : t('voice.recording')}
              </p>
              <VoiceRecorderButton
                label={t('voice.hold_to_send')}
                onPressStart={handlePressStart}
                onPressEnd={handlePressEnd}
                disabled={requestingPermission}
              />
              <p className="voice-recorder-hint">{t('voice.record_hint')}</p>
            </div>
          )}

          {view === 'sending' && (
            <div className="voice-recorder-block">
              <div className="voice-recorder-spinner" aria-hidden="true" />
              <p className="voice-recorder-status">{progressLabel(progressJob)}</p>
            </div>
          )}

          {view === 'send_error' && (
            <div className="voice-recorder-block">
              <p className="voice-recorder-alert">{sendErrorMessage}</p>
              {failedJob?.canRetry ? (
                <button type="button" className="voice-recorder-action" onClick={retry}>
                  {t('btn_retry')}
                </button>
              ) : null}
              <button
                type="button"
                className="voice-recorder-action is-secondary"
                onClick={handleRecordAgain}
              >
                {t('voice.record_again')}
              </button>
            </div>
          )}

          {view === 'load_error' && (
            <div className="voice-recorder-block">
              <p className="voice-recorder-alert">{t('voice_load_failed')}</p>
              <button
                type="button"
                className="voice-recorder-action"
                onClick={onRetryLoad}
                disabled={loadSaving}
              >
                {t('btn_retry')}
              </button>
              <button
                type="button"
                className="voice-recorder-action is-secondary"
                onClick={handleRecordAgain}
              >
                {t('voice.record_again')}
              </button>
            </div>
          )}

          {view === 'idle' && (
            <div className="voice-recorder-block">
              <VoiceRecorderButton
                label={t('voice.record_hint')}
                onPressStart={handlePressStart}
                onPressEnd={handlePressEnd}
              />
              <p className="voice-recorder-hint">{t('voice.record_hint')}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function VoiceRecorderModal({ open, onClose }: VoiceRecorderModalProps) {
  // Arming on first open keeps catalog RPCs and the recorder out of the app
  // start-up path, while leaving the job bridge alive once it exists.
  const [armed, setArmed] = useState(open)

  useEffect(() => {
    if (open && !armed) setArmed(true)
  }, [open, armed])

  if (!armed) return null

  return <VoiceJobBridge open={open} onClose={onClose} />
}
