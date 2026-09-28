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
import { MAX_AUDIO_DURATION_MS } from '@/voice/contract'
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
const TOTAL_SECONDS = Math.floor(MAX_AUDIO_DURATION_MS / 1000)

/** Job phases still owned by the modal (upload or backend processing). */
const IN_FLIGHT_PHASES: readonly string[] = ['uploading', 'queued', 'processing']

function isInFlight(job: VoiceJobState): boolean {
  return IN_FLIGHT_PHASES.includes(job.phase)
}

/** Newest job by creation time; the store keys jobs by id, so insertion order is not enough. */
function latestJob(jobs: Record<string, VoiceJobState>): VoiceJobState | null {
  let latest: VoiceJobState | null = null
  for (const job of Object.values(jobs)) {
    if (!latest || job.createdAt > latest.createdAt) latest = job
  }
  return latest
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
  const { jobs, submit, retryLastSubmit, resumePending, abandonInFlightJobs } = useVoiceJobs()
  const { loading: loadSaving, loadQuarantine, refresh } = useVoiceQuarantine()

  const [failedJob, setFailedJob] = useState<VoiceJobState | null>(null)
  // Set when the completed job could not be handed to the quarantine, so the
  // modal offers a retry instead of closing and losing the movements.
  const [loadFailed, setLoadFailed] = useState(false)
  const loadFailedRef = useRef<{ jobId: string; movements: VoiceMovement[] } | null>(null)
  // Key of the last outcome already reported to the user, so a re-render never
  // toasts twice.
  const handledRef = useRef<string | null>(null)
  // Timestamp of the last transition to `hidden`: measures how long the app
  // stayed backgrounded before deciding resume vs. abandon on return.
  const hiddenAtRef = useRef<number | null>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const activeJob = useMemo(() => latestJob(jobs), [jobs])
  const inFlightJob = useMemo(() => latestInFlightJob(jobs), [jobs])

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
    if (!activeJob) return

    if (activeJob.phase === 'completed') {
      const key = `completed:${activeJob.jobId}`
      if (handledRef.current === key) return
      handledRef.current = key
      setFailedJob(null)
      const jobId = activeJob.jobId
      const movements = activeJob.result?.movements ?? []
      // An empty result is a valid outcome, but nothing reaches the quarantine:
      // a success toast would promise a movement that does not exist.
      if (movements.length === 0) {
        showToast(t('voice.empty_result'), 'info')
        if (open) onCloseRef.current()
        return
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
        if (open) onCloseRef.current()
      })()
      return
    }

    if (activeJob.phase === 'failed') {
      const key = `failed:${activeJob.jobId}:${activeJob.errorCode ?? 'UNKNOWN'}`
      if (handledRef.current === key) return
      handledRef.current = key
      // A transport drop is silent (no toast), but the user still gets the
      // send_error view with Retry / Record again instead of an endless spinner.
      if (activeJob.errorCode === 'NETWORK') {
        setFailedJob(activeJob)
        return
      }
      showToast(t(mapVoiceErrorToI18nKey(activeJob.errorCode ?? 'UNKNOWN')), 'error')
      setFailedJob(activeJob)
      return
    }

    if (activeJob.phase === 'abandoned') {
      const key = `abandoned:${activeJob.jobId}`
      if (handledRef.current === key) return
      handledRef.current = key
      // The job died while the app was backgrounded past the resume window. The
      // quarantine may or may not have received the movements (the FAB polling
      // is the source of truth), so only bother the user when the modal is up.
      if (open) showToast(t('voice.voice_job_timeout'), 'error')
    }
  }, [activeJob, open, showToast, loadQuarantine])

  const clearFailure = useCallback((): void => {
    setFailedJob(null)
    setLoadFailed(false)
    loadFailedRef.current = null
  }, [])

  const retry = useCallback((): void => {
    // Re-arms the reporting key so a second failure is reported again.
    handledRef.current = null
    setFailedJob(null)
    void retryLastSubmit()
  }, [retryLastSubmit])

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
  submit: (blob: Blob) => Promise<void>
  retry: () => void
  clearFailure: () => void
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
  onClose,
}: VoiceRecorderSessionProps) {
  const { state, remainingSeconds, blob, autoStopped, error, start, stop, cancel } =
    useVoiceRecorder()

  const [tooLong, setTooLong] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const lastSubmittedBlobRef = useRef<Blob | null>(null)

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
    void submit(blob)
  }, [state, blob, autoStopped, submit])

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
              <button type="button" className="voice-recorder-action" onClick={handleClose}>
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
