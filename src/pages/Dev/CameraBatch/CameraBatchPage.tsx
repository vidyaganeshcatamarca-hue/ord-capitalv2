import { useCallback, useEffect, useRef, useState } from 'react'
import { getLanguage, t } from '@/locales/i18n'
import { OcrApiError, createOcrJob, getOcrJob, readOcrAccessToken } from '@/ocr/apiClient'
import {
  useFramedCamera,
  type CameraCapture,
  type TravelSample,
  type VideoInfo,
} from '@/ocr/camera/useFramedCamera'
import { useOcrContext } from '@/ocr/contextBuilder'
import { describeOcrJobStatus } from '@/ocr/jobStatusLabel'
import {
  isOcrTerminalStatus,
  type OcrIssue,
  type OcrJob,
  type OcrJobAccepted,
  type OcrJobStatus,
} from '@/ocr/types'
import './CameraBatch.css'

/**
 * Isolated measurement spike: does a persistent web camera produce four
 * consecutive shots with enough resolution and quality for OCR, and what does
 * the REAL OCR backend answer for them?
 *
 * This page is a THIN DIAGNOSTIC HOST. The camera engine lives in
 * `src/ocr/camera` (`useFramedCamera` + `displacement`), shared with the
 * product surface, and this page only adds what the product must never show:
 * the platform block, the real track settings, the live <video> state, the
 * per-sample calibration line and the copied report. If a readout here is
 * "technical", it belongs to this page and nowhere else.
 *
 * Development only: the route is registered under `import.meta.env.DEV` in
 * `src/App.tsx`, so a production build has no way to reach it. The shared
 * engine modules DO stay in the production bundle, because the product
 * consumes them.
 *
 * Deliberately self-contained and NOT wired to any product flow. It does not
 * touch the existing OCR capture sheet, the voice recorder or the file-input
 * paths.
 *
 * The shots are PAGES OF THE SAME TICKET, so they travel in ONE job: a
 * single `createOcrJob` call carries every captured photo, in capture order,
 * under the repeated `files` field the contract already defines. Sending one
 * job per photo would ask the backend to read four separate tickets that do
 * not exist. The measurement therefore shows one job id, one status, one issue
 * list and one normalized ticket for the whole batch.
 *
 * What it still refuses to do: persist anything (no IndexedDB, no
 * localStorage), write into the OCR history, or reuse `useOcrJobs`. Every send
 * is one throwaway job and the poll lives in this component.
 */

/** Bounded measurement window: one poll every 2 s for at most 90 s. */
const OCR_POLL_INTERVAL_MS = 2000
const OCR_POLL_WINDOW_MS = 90000

/** The copied report must stay readable, so the ticket JSON is trimmed here. */
const REPORT_JSON_MAX_CHARS = 1600

type PlatformInfo = {
  userAgent: string
  screenWidth: number
  screenHeight: number
  devicePixelRatio: number
  hasGetUserMedia: boolean
}

type View = 'capture' | 'report'

/** Why the measurement stopped, without claiming the backend job stopped. */
type OcrStopReason = 'terminal' | 'window' | 'stopped'

type OcrSendPhase = 'sending' | 'polling' | 'sent' | 'failed'

/**
 * Everything the ONE ticket job produced. There is exactly one of these per
 * send, because the whole batch is one ticket. Never holds the token or the
 * context.
 */
type OcrSend = {
  phase: OcrSendPhase
  jobId: string | null
  status: OcrJobStatus | null
  stage: string | null
  duplicate: boolean | null
  messageCode: string | null
  /** `error_code` declared by the job once it reached a terminal status. */
  jobErrorCode: string | null
  issues: OcrIssue[]
  /** Normalized ticket when the backend produced one, else the verbatim result. */
  result: unknown
  errorCode: string | null
  httpStatus: number | null
  errorKey: string | null
  stopReason: OcrStopReason | null
  /** How many photos went into this single job, frozen at click time. */
  fileCount: number
}

function startSend(fileCount: number): OcrSend {
  return {
    phase: 'sending',
    jobId: null,
    status: null,
    stage: null,
    duplicate: null,
    messageCode: null,
    jobErrorCode: null,
    issues: [],
    result: null,
    errorCode: null,
    httpStatus: null,
    errorKey: null,
    stopReason: null,
    fileCount,
  }
}

function readPlatformInfo(): PlatformInfo {
  return {
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
  }
}

function formatKb(bytes: number): string {
  return (bytes / 1024).toFixed(1)
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError'
}

/** Pretty JSON for the operator's eyes; never throws on a hostile payload. */
function prettyJson(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2)
    return typeof text === 'string' ? text : String(value)
  } catch {
    return String(value)
  }
}

/** Same JSON, trimmed so the copied report stays readable. */
function reportJson(value: unknown): string {
  const full = prettyJson(value)
  if (full.length <= REPORT_JSON_MAX_CHARS) return full
  return `${full.slice(0, REPORT_JSON_MAX_CHARS)}\n${t('dev_camera_batch_msg_ocr_result_trimmed', {
    count: REPORT_JSON_MAX_CHARS,
    total: full.length,
  })}`
}

/** `CODE #2 field`, the smallest useful shape of a backend issue. */
function formatIssue(issue: OcrIssue): string {
  const parts = [issue.code]
  if (issue.item_index != null) parts.push(`#${issue.item_index}`)
  if (issue.field) parts.push(issue.field)
  return parts.join(' ')
}

/** One line per capture, plus the platform block and the single job's answer:
 *  the spike's real output. */
function buildReport(
  platform: PlatformInfo,
  video: VideoInfo | null,
  captures: CameraCapture[],
  send: OcrSend | null,
): string {
  const lines: string[] = [
    t('dev_camera_batch_title'),
    `${t('dev_camera_batch_label_platform')}: userAgent=${platform.userAgent} screen=${platform.screenWidth}x${platform.screenHeight} devicePixelRatio=${platform.devicePixelRatio} getUserMedia=${String(platform.hasGetUserMedia)}`,
    video === null
      ? 'video=-'
      : `${t('dev_camera_batch_label_video')}: ${video.width}x${video.height} paused=${String(video.paused)} readyState=${video.readyState} playError=${video.playError ?? '-'}`,
    `${t('dev_camera_batch_label_photos', { count: captures.length })}`,
  ]

  if (captures.length === 0 && send === null) {
    lines.push('-')
    return lines.join('\n')
  }

  for (const record of captures) {
    const resolution = `${record.streamWidth ?? '?'}x${record.streamHeight ?? '?'}`
    const dimensions = `${record.width}x${record.height}`
    const size = record.bytes > 0 ? `${formatKb(record.bytes)} KB (${record.bytes} B)` : '0 B'
    const duration = record.durationMs == null ? '-' : `${record.durationMs} ms`
    lines.push(
      `#${record.index} ${t('dev_camera_batch_label_stream_resolution')}=${resolution}` +
        ` facingMode=${record.facingMode ?? '?'}` +
        ` deviceId=${record.deviceId ?? '?'}` +
        ` ${t('dev_camera_batch_label_capture_dimensions')}=${dimensions}` +
        ` ${t('dev_camera_batch_label_blob_size')}=${size} ${record.mimeType}` +
        ` duration=${duration}` +
        ` ${t('dev_camera_batch_label_errors')}=${record.error ?? '-'}`,
    )
  }

  // One job for the whole ticket: one block, never one block per photo.
  if (send === null) return lines.join('\n')

  const issues = send.issues.length === 0 ? '-' : send.issues.map(formatIssue).join(', ')
  lines.push(
    `${t('dev_camera_batch_label_ocr_job')}` +
      ` ${t('dev_camera_batch_label_job_id')}=${send.jobId ?? '-'}` +
      ` ${t('dev_camera_batch_label_ocr_status')}=${send.status ?? send.phase}` +
      ` ${t('dev_camera_batch_label_ocr_files')}=${send.fileCount}` +
      ` ${t('dev_camera_batch_label_duplicate')}=${send.duplicate == null ? '-' : String(send.duplicate)}` +
      ` ${t('dev_camera_batch_label_message_code')}=${send.messageCode ?? '-'}` +
      ` ${t('dev_camera_batch_label_error_code')}=${send.errorCode ?? send.jobErrorCode ?? '-'}` +
      (send.httpStatus == null ? '' : ` ${t('dev_camera_batch_label_http_status')}=${send.httpStatus}`) +
      ` ${t('dev_camera_batch_label_ocr_issues')}=${issues}`,
  )
  if (send.result != null) {
    lines.push(`${t('dev_camera_batch_label_ocr_result')}:\n${reportJson(send.result)}`)
  }

  return lines.join('\n')
}

/** Resolves a translation, falling back to the raw code when the key is
 *  unknown to `t()` (it returns the key itself when it cannot resolve it). */
function translateOr(key: string, fallback: string): string {
  const value = t(key)
  return value === key ? fallback : value
}

/** Sleep that gives up immediately when the caller aborts the poll. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const onAbort = (): void => {
      if (timer !== null) clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function failurePatch(error: unknown): Partial<OcrSend> {
  if (error instanceof OcrApiError) {
    return {
      phase: 'failed',
      errorCode: error.code,
      httpStatus: error.httpStatus,
      errorKey: error.i18nKey,
      stopReason: null,
    }
  }
  return { phase: 'failed', errorCode: 'UNKNOWN', httpStatus: null, errorKey: null, stopReason: null }
}

/** Everything the single ticket job shows. Rendered once, never per photo. */
function OcrJobPanel({ send }: { send: OcrSend }) {
  const phaseLabel =
    send.phase === 'sending'
      ? t('dev_camera_batch_status_sending')
      : send.phase === 'polling'
        ? t('dev_camera_batch_status_polling')
        : send.phase === 'failed'
          ? t('dev_camera_batch_status_failed')
          : t('dev_camera_batch_status_sent')

  const statusDisplay = describeOcrJobStatus(send.status, send.stage)
  const statusText = statusDisplay === null ? null : translateOr(statusDisplay.key, send.status ?? '')
  const errorMessage =
    send.errorKey === null ? null : translateOr(send.errorKey, send.errorCode ?? 'UNKNOWN')

  return (
    <div className="camera-batch-ocr">
      <p className={`camera-batch-ocr-phase is-${send.phase}`}>
        {phaseLabel}
        {statusText ? ` · ${statusText}` : ''}
      </p>

      <dl className="camera-batch-meta">
        <dt>{t('dev_camera_batch_label_ocr_files')}</dt>
        <dd>{send.fileCount}</dd>
        {send.jobId && (
          <>
            <dt>{t('dev_camera_batch_label_job_id')}</dt>
            <dd>{send.jobId}</dd>
          </>
        )}
        {send.status && (
          <>
            <dt>{t('dev_camera_batch_label_ocr_status')}</dt>
            <dd>{send.status}</dd>
          </>
        )}
        {send.duplicate != null && (
          <>
            <dt>{t('dev_camera_batch_label_duplicate')}</dt>
            <dd>{String(send.duplicate)}</dd>
          </>
        )}
        {send.messageCode && (
          <>
            <dt>{t('dev_camera_batch_label_message_code')}</dt>
            <dd>{send.messageCode}</dd>
          </>
        )}
        {(send.errorCode || send.jobErrorCode) && (
          <>
            <dt>{t('dev_camera_batch_label_error_code')}</dt>
            <dd>{send.errorCode ?? send.jobErrorCode}</dd>
          </>
        )}
        {send.httpStatus != null && (
          <>
            <dt>{t('dev_camera_batch_label_http_status')}</dt>
            <dd>{send.httpStatus}</dd>
          </>
        )}
      </dl>

      {errorMessage && <p className="camera-batch-error">{errorMessage}</p>}
      {send.stopReason && <p className="camera-batch-note">{t('dev_camera_batch_msg_ocr_done')}</p>}

      {send.issues.length > 0 && (
        <>
          <p className="camera-batch-ocr-label">{t('dev_camera_batch_label_ocr_issues')}</p>
          <ul className="camera-batch-ocr-issues">
            {send.issues.map((issue, position) => (
              <li key={`${issue.code}-${issue.field ?? '-'}-${issue.item_index ?? '-'}-${position}`}>
                {formatIssue(issue)}
              </li>
            ))}
          </ul>
        </>
      )}

      {send.result != null && (
        <>
          <p className="camera-batch-ocr-label">{t('dev_camera_batch_label_ocr_result')}</p>
          <pre className="camera-batch-report camera-batch-ocr-json">{prettyJson(send.result)}</pre>
        </>
      )}
    </div>
  )
}

export function CameraBatchPage() {
  const mountedRef = useRef(true)
  /** The one in-flight upload/poll of the ticket job, so every teardown path
   *  can abort it. There is only ever one: the batch is one job. */
  const ocrControllerRef = useRef<AbortController | null>(null)

  const [view, setView] = useState<View>('capture')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [platform] = useState<PlatformInfo>(readPlatformInfo)
  /** The job's state. One entry for the whole ticket, not one per photo. */
  const [send, setSend] = useState<OcrSend | null>(null)

  /**
   * The camera, its captures and the travel meter: the SAME engine the product
   * surface uses. Only the console line is added, because phone remote
   * debugging reads it during the physical test.
   */
  const handleCapture = useCallback((capture: CameraCapture) => {
    console.info('camera_batch_capture', capture)
  }, [])
  const camera = useFramedCamera({ onCapture: handleCapture })

  // The ORD snapshot the backend expects with every ticket. Read-only here:
  // the spike sends it and prints the answer, it never mutates anything.
  const { context: ocrContext, loading: ocrContextLoading } = useOcrContext(getLanguage())

  // One sample of the meter, verbatim, in the console at the sampling cadence
  // (125 ms) -- never per frame. This is the line the physical test reads.
  const travelSample: TravelSample | null = camera.travel.sample
  useEffect(() => {
    if (travelSample === null) return
    console.info(
      'camera_batch_shift',
      `shift=${travelSample.shift ?? 'null'}`,
      `score=${travelSample.score === null ? 'null' : travelSample.score.toFixed(3)}`,
      `${travelSample.verdict} delta=${travelSample.delta}`,
      `offset=${travelSample.offset}/${travelSample.rows} shown=${travelSample.percent}% ready=${String(travelSample.ready)}`,
    )
  }, [travelSample])

  // Unmount: the hook stops the tracks and releases the object URLs, so this
  // only has to abort the in-flight OCR work. No state update may land after
  // this point.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      ocrControllerRef.current?.abort()
      ocrControllerRef.current = null
    }
  }, [])

  /** Aborts the in-flight upload/poll and leaves the panel in a readable
   *  state: the job keeps running on the backend, we just stop watching it, so
   *  a cancelled poll can never stay stuck on "polling". */
  const resetOcrPoll = useCallback(() => {
    const controller = ocrControllerRef.current
    if (controller === null) return
    controller.abort()
    ocrControllerRef.current = null
    if (!mountedRef.current) return
    setSend(previous => {
      if (previous === null) return previous
      if (previous.phase !== 'polling' && previous.phase !== 'sending') return previous
      return { ...previous, phase: 'sent', stopReason: 'stopped' }
    })
  }, [])

  const patchSend = useCallback((patch: Partial<OcrSend>) => {
    if (!mountedRef.current) return
    setSend(previous => ({ ...(previous ?? startSend(0)), ...patch }))
  }, [])

  /** Reads the one job until a terminal status or the 90 s window ends. */
  const pollOcrJob = useCallback(
    async (jobId: string, accessToken: string, controller: AbortController) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < OCR_POLL_WINDOW_MS) {
        await sleepAbortable(OCR_POLL_INTERVAL_MS, controller.signal)
        if (controller.signal.aborted || !mountedRef.current) return
        if (Date.now() - startedAt > OCR_POLL_WINDOW_MS) break

        let job: OcrJob
        try {
          job = await getOcrJob({ jobId, accessToken, signal: controller.signal })
        } catch (error) {
          if (controller.signal.aborted || isAbort(error) || !mountedRef.current) return
          patchSend(failurePatch(error))
          if (ocrControllerRef.current === controller) ocrControllerRef.current = null
          return
        }
        if (controller.signal.aborted || !mountedRef.current) return

        const terminal = isOcrTerminalStatus(job.status)
        patchSend({
          phase: terminal ? 'sent' : 'polling',
          status: job.status,
          stage: job.stage,
          issues: job.issues,
          messageCode: job.message_code,
          jobErrorCode: job.error_code,
          result: job.ticket ?? job.raw_result,
          stopReason: terminal ? 'terminal' : null,
        })
        if (terminal) {
          if (ocrControllerRef.current === controller) ocrControllerRef.current = null
          return
        }
      }
      if (controller.signal.aborted || !mountedRef.current) return
      patchSend({ phase: 'sent', stopReason: 'window' })
      if (ocrControllerRef.current === controller) ocrControllerRef.current = null
    },
    [patchSend],
  )

  /** Uploads every captured photo as ONE ticket and measures the answer.
   *  Exactly one `createOcrJob` call per click, with the files in capture
   *  order: the photos are pages of the same ticket, not separate tickets. */
  const sendTicket = async () => {
    // The hook's `files` IS the contract surface: the same File[] the OCR flow
    // consumes from a file input, in capture order.
    const files = camera.files
    if (files.length === 0) return
    if (send !== null && (send.phase === 'sending' || send.phase === 'polling')) return

    // A previous measurement of the batch is discarded, not merged.
    ocrControllerRef.current?.abort()
    const controller = new AbortController()
    ocrControllerRef.current = controller
    if (mountedRef.current) setSend(startSend(files.length))

    const accessToken = await readOcrAccessToken()
    if (controller.signal.aborted || !mountedRef.current) return
    if (!accessToken) {
      patchSend({
        phase: 'failed',
        errorCode: 'NO_SESSION',
        httpStatus: null,
        errorKey: 'dev_camera_batch_msg_ocr_no_session',
        stopReason: null,
      })
      if (ocrControllerRef.current === controller) ocrControllerRef.current = null
      return
    }

    if (!ocrContext) {
      patchSend({
        phase: 'failed',
        errorCode: ocrContextLoading ? 'CONTEXT_LOADING' : 'CONTEXT_UNAVAILABLE',
        httpStatus: null,
        errorKey: 'dev_camera_batch_msg_ocr_no_context',
        stopReason: null,
      })
      if (ocrControllerRef.current === controller) ocrControllerRef.current = null
      return
    }

    let accepted: OcrJobAccepted
    try {
      accepted = await createOcrJob({ files, context: ocrContext, accessToken, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted || isAbort(error) || !mountedRef.current) return
      patchSend(failurePatch(error))
      if (ocrControllerRef.current === controller) ocrControllerRef.current = null
      return
    }
    if (controller.signal.aborted || !mountedRef.current) return

    patchSend({
      phase: isOcrTerminalStatus(accepted.status) ? 'sent' : 'polling',
      jobId: accepted.job_id,
      status: accepted.status,
      duplicate: accepted.duplicate,
      messageCode: accepted.message_code,
      stopReason: isOcrTerminalStatus(accepted.status) ? 'terminal' : null,
    })

    if (isOcrTerminalStatus(accepted.status)) {
      if (ocrControllerRef.current === controller) ocrControllerRef.current = null
      return
    }

    await pollOcrJob(accepted.job_id, accessToken, controller)
  }

  const { close: closeCamera, open: openCameraStream } = camera
  const photoCount = camera.captures.reduce((total, item) => (item.url ? total + 1 : total), 0)
  const sendableCount = camera.files.length
  const isLive = camera.status === 'live'
  // Red only once the meter is actually measuring: the waiting state is neutral,
  // never pulsing, so it cannot be mistaken for "move along". The value itself
  // carries the hysteresis decided in the hook; it is NOT recomputed from the
  // number here, or the pulse would flip at 70% again.
  const shiftIsReady = camera.travel.armed && camera.travel.ready
  const ocrBusy = send !== null && (send.phase === 'sending' || send.phase === 'polling')

  const openCamera = async () => {
    setCopyState('idle')
    setView('capture')
    // Leaving the spike's OCR measurement behind: no poll may keep running.
    resetOcrPoll()
    await openCameraStream()
  }

  /** Done keeps the captures: the report and the pending send still need them.
   *  Only the stream goes away. */
  const finish = () => {
    closeCamera()
    setView('report')
  }

  const copyReport = () => {
    const text = buildReport(platform, camera.videoInfo, camera.captures, send)
    if (typeof navigator.clipboard?.writeText !== 'function') {
      setCopyState('failed')
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'))
  }

  const cameraErrorMessage =
    camera.error === 'no_camera'
      ? t('dev_camera_batch_msg_no_camera')
      : camera.error === 'permission_denied'
        ? t('dev_camera_batch_msg_permission_denied')
        : camera.error === 'camera_error'
          ? t('dev_camera_batch_msg_camera_error')
          : null

  return (
    <div className="camera-batch-page">
      <header className="camera-batch-header">
        <h1 className="font-display">{t('dev_camera_batch_title')}</h1>
        <p className="camera-batch-intro">{t('dev_camera_batch_intro')}</p>
      </header>

      <section className="camera-batch-platform">
        <h2 className="camera-batch-section-title">{t('dev_camera_batch_label_platform')}</h2>
        <dl className="camera-batch-meta">
          <dt>userAgent</dt>
          <dd>{platform.userAgent}</dd>
          <dt>screen</dt>
          <dd>
            {platform.screenWidth} x {platform.screenHeight}
          </dd>
          <dt>devicePixelRatio</dt>
          <dd>{platform.devicePixelRatio}</dd>
          <dt>getUserMedia</dt>
          <dd>{String(platform.hasGetUserMedia)}</dd>
        </dl>
      </section>

      {view === 'capture' ? (
        <>
          <div className="camera-batch-stage">
            <video
              ref={camera.attachVideo}
              className="camera-batch-video"
              playsInline
              muted
              autoPlay
            />
            {isLive && (
              <div className="camera-batch-frame" aria-hidden="true">
                <span className="camera-batch-frame-corner is-tl" />
                <span className="camera-batch-frame-corner is-tr" />
                <span className="camera-batch-frame-corner is-bl" />
                <span className="camera-batch-frame-corner is-br" />
              </div>
            )}
            {!isLive && (
              <span className="camera-batch-stage-hint">{t('dev_camera_batch_status_idle')}</span>
            )}
          </div>

          {/* Capture stays glued to the preview: scrolling down to find it used to
              push the image out of view. `camera.capture` refuses only on the
              photo cap, never on the meter. */}
          <div className="camera-batch-capture-bar">
            <button
              type="button"
              className="btn btn-primary btn-full btn-lg"
              onClick={camera.capture}
              disabled={!camera.canCapture}
            >
              {t('dev_camera_batch_btn_capture')}
            </button>
          </div>

          {/* The one aid the owner kept. It lives OUTSIDE the stage, right below
              the shutter, in normal flow: over a homogeneous receipt every
              overlay became unreadable. It advises and never disables the
              button above, and it stays on screen before the first capture on
              purpose: it says what to do instead of showing a fake 0%. */}
          <div
            className={`camera-batch-shift${shiftIsReady ? ' is-ready' : ''}${
              camera.travel.armed ? '' : ' is-waiting'
            }`}
            data-state={
              !camera.travel.armed ? 'waiting' : shiftIsReady ? 'ready' : 'below-target'
            }
          >
            <div className="camera-batch-shift-head">
              <span className="camera-batch-shift-label">
                {t('dev_camera_batch_label_shift')}
              </span>
              <span className="camera-batch-shift-value">{camera.travel.percent}%</span>
            </div>
            <span
              className="camera-batch-shift-track"
              role="meter"
              aria-label={t('dev_camera_batch_label_shift')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={camera.travel.percent}
              aria-valuetext={
                camera.travel.armed
                  ? `${camera.travel.percent}%`
                  : t('dev_camera_batch_msg_shift_waiting')
              }
            >
              <span
                className="camera-batch-shift-fill"
                style={{ width: `${camera.travel.percent}%` }}
              />
            </span>
            <p className="camera-batch-shift-state">
              {!camera.travel.armed
                ? t('dev_camera_batch_msg_shift_waiting')
                : shiftIsReady
                  ? t('dev_camera_batch_msg_shift_ready')
                  : t('dev_camera_batch_msg_shift_keep_going')}
            </p>
            {/* TEMPORARY DIAGNOSTICS -- this page is where they live, and this
                page is development-only. One compact line so the physical test
                on the phone can tell WHY a sample moved the meter or did not:
                  shift: the frame-to-frame estimate in sampler rows
                  score: its normalised correlation, -1..1
                  verdict: applied | jitter | out_of_window | not_measured
                  delta: rows this sample added (or subtracted)
                  off: the exact internal offset in rows, and the frame height
                  %: the smoothed value the operator sees
                  R: the hysteresis state (pulse) at that moment
                aria-hidden because it is a developer readout, not a message for
                the operator. */}
            {travelSample !== null && (
              <p className="camera-batch-shift-debug" aria-hidden="true">
                {`shift=${travelSample.shift ?? 'null'} score=${
                  travelSample.score === null ? 'null' : travelSample.score.toFixed(2)
                } ${travelSample.verdict} d=${travelSample.delta > 0 ? '+' : ''}${
                  travelSample.delta
                } off=${travelSample.offset}/${travelSample.rows} ${travelSample.percent}% R=${
                  travelSample.ready ? 1 : 0
                }`}
              </p>
            )}
          </div>

          <p className={`camera-batch-status ${isLive ? 'is-live' : 'is-idle'}`}>
            {isLive ? t('dev_camera_batch_status_live') : t('dev_camera_batch_status_idle')}
          </p>

          {camera.settings && (
            <dl className="camera-batch-meta">
              <dt>{t('dev_camera_batch_label_stream_resolution')}</dt>
              <dd>
                {camera.settings.width ?? '?'} x {camera.settings.height ?? '?'}
              </dd>
              {camera.settings.facingMode && (
                <>
                  <dt>facingMode</dt>
                  <dd>{camera.settings.facingMode}</dd>
                </>
              )}
              {camera.settings.deviceId && (
                <>
                  <dt>deviceId</dt>
                  <dd>{camera.settings.deviceId}</dd>
                </>
              )}
            </dl>
          )}

          {camera.videoInfo && (
            <dl className="camera-batch-meta">
              <dt>{t('dev_camera_batch_label_video')}</dt>
              <dd>
                {camera.videoInfo.width} x {camera.videoInfo.height}
              </dd>
              <dt>paused / readyState</dt>
              <dd>
                {String(camera.videoInfo.paused)} / {camera.videoInfo.readyState}
              </dd>
              {camera.videoInfo.playError && (
                <>
                  <dt>{t('dev_camera_batch_label_errors')}</dt>
                  <dd className="camera-batch-error">{camera.videoInfo.playError}</dd>
                </>
              )}
            </dl>
          )}

          {cameraErrorMessage && <p className="camera-batch-error">{cameraErrorMessage}</p>}

          <div className="camera-batch-actions">
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={() => {
                void openCamera()
              }}
            >
              {t('dev_camera_batch_btn_open_camera')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={finish}
              disabled={!isLive && camera.count === 0}
            >
              {t('dev_camera_batch_btn_done')}
            </button>
          </div>

          {camera.capReached && (
            <p className="camera-batch-note">{t('dev_camera_batch_msg_cap_reached')}</p>
          )}
        </>
      ) : (
        <section className="camera-batch-report-block">
          <pre className="camera-batch-report">
            {buildReport(platform, camera.videoInfo, camera.captures, send)}
          </pre>
          <div className="camera-batch-actions">
            <button type="button" className="btn btn-primary btn-full" onClick={copyReport}>
              {t('dev_camera_batch_btn_copy_report')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={() => {
                void openCamera()
              }}
            >
              {t('dev_camera_batch_btn_open_camera')}
            </button>
          </div>
          {copyState === 'copied' && (
            <p className="camera-batch-note">{t('dev_camera_batch_msg_copied')}</p>
          )}
          {copyState === 'failed' && (
            <p className="camera-batch-error">{t('dev_camera_batch_msg_copy_failed')}</p>
          )}
        </section>
      )}

      <section className="camera-batch-captures">
        <h2 className="camera-batch-section-title">
          {t('dev_camera_batch_label_photos', { count: photoCount })}
        </h2>

        {/* One send button for the whole ticket, right above the grid so it is
            reachable on a 385 px viewport without scrolling past four cards. */}
        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={() => {
            void sendTicket()
          }}
          disabled={sendableCount === 0 || ocrBusy}
        >
          {t('dev_camera_batch_btn_send_ticket', { count: sendableCount })}
        </button>
        <p className="camera-batch-note">{t('dev_camera_batch_msg_ocr_single_job')}</p>

        {send && <OcrJobPanel send={send} />}

        {camera.captures.length === 0 && <p className="camera-batch-note">-</p>}
        <ul className="camera-batch-thumbs">
          {camera.captures.map(item => (
            <li key={item.index} className="camera-batch-thumb">
              {item.url ? (
                <img src={item.url} alt={item.fileName} className="camera-batch-thumb-img" />
              ) : (
                <div className="camera-batch-thumb-img is-empty">{item.fileName}</div>
              )}
              <dl className="camera-batch-meta">
                <dt>{t('dev_camera_batch_label_stream_resolution')}</dt>
                <dd>
                  {item.streamWidth ?? '?'} x {item.streamHeight ?? '?'}
                </dd>
                <dt>{t('dev_camera_batch_label_capture_dimensions')}</dt>
                <dd>
                  {item.width} x {item.height}
                </dd>
                <dt>{t('dev_camera_batch_label_blob_size')}</dt>
                <dd>
                  {item.bytes} B / {formatKb(item.bytes)} KB
                  {item.durationMs == null ? '' : ` / ${item.durationMs} ms`}
                </dd>
                <dt>type</dt>
                <dd>{item.mimeType}</dd>
                {item.error && (
                  <>
                    <dt>{t('dev_camera_batch_label_errors')}</dt>
                    <dd className="camera-batch-error">{item.error}</dd>
                  </>
                )}
              </dl>
              <button
                type="button"
                className="btn btn-danger btn-full"
                onClick={() => camera.remove(item.index)}
              >
                {t('dev_camera_batch_btn_delete')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
