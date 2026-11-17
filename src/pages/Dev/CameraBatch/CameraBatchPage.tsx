import { useCallback, useEffect, useRef, useState } from 'react'
import { getLanguage, t } from '@/locales/i18n'
import { OcrApiError, createOcrJob, getOcrJob, readOcrAccessToken } from '@/ocr/apiClient'
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

/** Product cap for one ticket: the OCR flow accepts up to 10 pages. */
const MAX_CAPTURES = 10
/** Share of a capture shown as the overlap guide for the next one. */
const GUIDE_STRIP_RATIO = 0.2
const JPEG_QUALITY = 0.92

/** Bounded measurement window: one poll every 2 s for at most 90 s. */
const OCR_POLL_INTERVAL_MS = 2000
const OCR_POLL_WINDOW_MS = 90000

/** The copied report must stay readable, so the ticket JSON is trimmed here. */
const REPORT_JSON_MAX_CHARS = 1600

type CaptureRecord = {
  index: number
  streamWidth: number | null
  streamHeight: number | null
  facingMode: string | null
  deviceId: string | null
  width: number
  height: number
  blobSize: number
  mimeType: string
  durationMs: number | null
  error: string | null
}

type Capture = {
  record: CaptureRecord
  blob: Blob | null
  url: string | null
  fileName: string
  /** Bottom 20% of this capture as a data URL: the visual reference for the
   *  next shot. Null when the capture failed or the strip could not be built. */
  guideStrip: string | null
}

/** A capture that actually produced bytes, so it can travel in a job. */
type CaptureWithBlob = Capture & { blob: Blob }

type PlatformInfo = {
  userAgent: string
  screenWidth: number
  screenHeight: number
  devicePixelRatio: number
  hasGetUserMedia: boolean
}

/** What the <video> element is actually doing. The preview can be invisible
 *  while the canvas still captures, so this is the only way to tell them apart. */
type VideoInfo = {
  videoWidth: number
  videoHeight: number
  paused: boolean
  readyState: number
  playError: string | null
}

type CameraError = 'no_camera' | 'permission_denied' | 'camera_error'

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

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  return String(err)
}

/**
 * Bottom fifth of a capture, as a data URL. It is built from the SAME canvas
 * that produced the photo, so there is nothing to decode and nothing to
 * analyse: this is a visual reference for the operator, never a measurement.
 */
function buildGuideStrip(canvas: HTMLCanvasElement, width: number, height: number): string | null {
  const stripHeight = Math.max(1, Math.round(height * GUIDE_STRIP_RATIO))
  const strip = document.createElement('canvas')
  strip.width = width
  strip.height = stripHeight
  const ctx = strip.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(canvas, 0, height - stripHeight, width, stripHeight, 0, 0, width, stripHeight)
    return strip.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
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
  captures: Capture[],
  send: OcrSend | null,
): string {
  const lines: string[] = [
    t('dev_camera_batch_title'),
    `${t('dev_camera_batch_label_platform')}: userAgent=${platform.userAgent} screen=${platform.screenWidth}x${platform.screenHeight} devicePixelRatio=${platform.devicePixelRatio} getUserMedia=${String(platform.hasGetUserMedia)}`,
    video === null
      ? 'video=-'
      : `${t('dev_camera_batch_label_video')}: ${video.videoWidth}x${video.videoHeight} paused=${String(video.paused)} readyState=${video.readyState} playError=${video.playError ?? '-'}`,
    `${t('dev_camera_batch_label_photos', { count: captures.length })}`,
  ]

  if (captures.length === 0 && send === null) {
    lines.push('-')
    return lines.join('\n')
  }

  for (const { record } of captures) {
    const resolution = `${record.streamWidth ?? '?'}x${record.streamHeight ?? '?'}`
    const dimensions = `${record.width}x${record.height}`
    const size = record.blobSize > 0 ? `${formatKb(record.blobSize)} KB (${record.blobSize} B)` : '0 B'
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
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const nextIndexRef = useRef(1)
  const mountedRef = useRef(true)
  /** The one in-flight upload/poll of the ticket job, so every teardown path
   *  can abort it. There is only ever one: the batch is one job. */
  const ocrControllerRef = useRef<AbortController | null>(null)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [settings, setSettings] = useState<MediaTrackSettings | null>(null)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [cameraError, setCameraError] = useState<CameraError | null>(null)
  const [view, setView] = useState<View>('capture')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [platform] = useState<PlatformInfo>(readPlatformInfo)
  /** The job's state. One entry for the whole ticket, not one per photo. */
  const [send, setSend] = useState<OcrSend | null>(null)

  // The ORD snapshot the backend expects with every ticket. Read-only here:
  // the spike sends it and prints the answer, it never mutates anything.
  const { context: ocrContext, loading: ocrContextLoading } = useOcrContext(getLanguage())

  /** Single exit path for the media stream: no track can outlive the page. */
  const stopStream = useCallback((resetUi = true) => {
    const current = streamRef.current
    if (current) {
      for (const track of current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (resetUi) {
      setStream(null)
      setSettings(null)
    }
  }, [])

  // Unmount: stop the tracks (silent, the component is gone) and release every
  // object URL so the blobs become collectable. The in-flight OCR work is
  // aborted first: no state update may land after this point.
  useEffect(() => {
    mountedRef.current = true
    const urls = objectUrlsRef.current
    return () => {
      mountedRef.current = false
      ocrControllerRef.current?.abort()
      ocrControllerRef.current = null
      stopStream(false)
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [stopStream])

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

  // The stream is attached here (never through JSX props) so React cannot drop
  // srcObject on a re-render. `sync` is the preview's only source of truth: a
  // paused or zero-sized <video> means the user sees nothing even though
  // canvas.drawImage keeps producing frames.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!stream) {
      video.srcObject = null
      setVideoInfo(null)
      return
    }

    const sync = (playError: string | null) => {
      setVideoInfo({
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        paused: video.paused,
        readyState: video.readyState,
        playError,
      })
    }

    video.muted = true
    video.srcObject = stream
    video.onloadedmetadata = () => sync(null)
    video.onplaying = () => sync(null)
    void video
      .play()
      .then(() => sync(null))
      .catch(err => sync(describeError(err)))

    return () => {
      video.onloadedmetadata = null
      video.onplaying = null
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])

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
    const shots: CaptureWithBlob[] = captures
      .filter((item): item is CaptureWithBlob => item.blob !== null)
      .sort((a, b) => a.record.index - b.record.index)
    if (shots.length === 0) return
    if (send !== null && (send.phase === 'sending' || send.phase === 'polling')) return

    // A previous measurement of the batch is discarded, not merged.
    ocrControllerRef.current?.abort()
    const controller = new AbortController()
    ocrControllerRef.current = controller
    if (mountedRef.current) setSend(startSend(shots.length))

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

    // All pages of the ticket, in capture order, in a single multipart body.
    const files = shots.map(shot => new File([shot.blob], shot.fileName, { type: 'image/jpeg' }))

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

  const captureCount = captures.length
  const photoCount = captures.reduce((total, item) => (item.url ? total + 1 : total), 0)
  /** Only a capture that produced bytes can travel: a failed shot has no blob. */
  const sendableCount = captures.reduce((total, item) => (item.blob !== null ? total + 1 : total), 0)
  const capReached = photoCount >= MAX_CAPTURES
  const isLive = stream !== null
  /** Overlap reference for the NEXT shot: the bottom strip of the newest
   *  capture that has bytes. Derived instead of stored, so deleting the last
   *  photo falls back to the previous one and deleting everything removes the
   *  guide. Only visible while the camera is live: closing it clears the guide. */
  const guideStrip =
    (isLive ? ([...captures].reverse().find(item => item.blob !== null)?.guideStrip ?? null) : null)
  const ocrBusy = send !== null && (send.phase === 'sending' || send.phase === 'polling')

  const addCapture = (item: Capture) => {
    setCaptures(prev => [...prev, item])
    // Phone remote debugging reads this console line.
    console.info('camera_batch_capture', item.record)
  }

  const openCamera = async () => {
    setCameraError(null)
    setCopyState('idle')
    setView('capture')
    stopStream()
    // Leaving the spike's OCR measurement behind: no poll may keep running.
    resetOcrPoll()

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('no_camera')
      return
    }

    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = next
      setStream(next)
      setSettings(next.getVideoTracks()[0]?.getSettings() ?? null)
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setCameraError(
        name === 'NotAllowedError' || name === 'SecurityError' ? 'permission_denied' : 'camera_error',
      )
    }
  }

  const capture = () => {
    const video = videoRef.current
    const current = streamRef.current
    if (!video || !current) return
    if (photoCount >= MAX_CAPTURES) return

    const index = nextIndexRef.current
    nextIndexRef.current += 1
    const fileName = `batch-${index}.jpg`
    const startedAt = performance.now()
    const trackSettings = current.getVideoTracks()[0]?.getSettings()
    const base = {
      index,
      streamWidth: trackSettings?.width ?? null,
      streamHeight: trackSettings?.height ?? null,
      facingMode: trackSettings?.facingMode ?? null,
      deviceId: trackSettings?.deviceId ?? null,
    }

    const width = video.videoWidth
    const height = video.videoHeight
    const failed = (message: string) => {
      addCapture({
        record: {
          ...base,
          width,
          height,
          blobSize: 0,
          mimeType: 'image/jpeg',
          durationMs: Math.round(performance.now() - startedAt),
          error: message,
        },
        blob: null,
        url: null,
        fileName,
        guideStrip: null,
      })
    }

    if (width === 0 || height === 0) {
      failed('video has no dimensions yet')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      failed('2d context unavailable')
      return
    }

    try {
      ctx.drawImage(video, 0, 0, width, height)
    } catch (err) {
      failed(`drawImage failed: ${describeError(err)}`)
      return
    }

    canvas.toBlob(
      (blob) => {
        const durationMs = Math.round(performance.now() - startedAt)
        if (!blob) {
          addCapture({
            record: {
              ...base,
              width,
              height,
              blobSize: 0,
              mimeType: 'image/jpeg',
              durationMs,
              error: 'canvas.toBlob returned null',
            },
            blob: null,
            url: null,
            fileName,
            guideStrip: null,
          })
          return
        }
        const url = URL.createObjectURL(blob)
        objectUrlsRef.current.add(url)
        addCapture({
          record: {
            ...base,
            width,
            height,
            blobSize: blob.size,
            mimeType: blob.type,
            durationMs,
            error: null,
          },
          blob,
          url,
          fileName,
          guideStrip: buildGuideStrip(canvas, width, height),
        })
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  }

  /** Deleting a page does NOT touch the running poll: the job already exists on
   *  the server, so stopping the poll would only hide the answer. */
  const removeCapture = (index: number) => {
    const target = captures.find(item => item.record.index === index)
    if (target?.url) {
      URL.revokeObjectURL(target.url)
      objectUrlsRef.current.delete(target.url)
    }
    setCaptures(prev => prev.filter(item => item.record.index !== index))
  }

  const finish = () => {
    stopStream()
    setView('report')
  }

  const copyReport = () => {
    const text = buildReport(platform, videoInfo, captures, send)
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
    cameraError === 'no_camera'
      ? t('dev_camera_batch_msg_no_camera')
      : cameraError === 'permission_denied'
        ? t('dev_camera_batch_msg_permission_denied')
        : cameraError === 'camera_error'
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
            <video ref={videoRef} className="camera-batch-video" playsInline muted autoPlay />
            {isLive && (
              <div className="camera-batch-frame" aria-hidden="true">
                <span className="camera-batch-frame-corner is-tl" />
                <span className="camera-batch-frame-corner is-tr" />
                <span className="camera-batch-frame-corner is-bl" />
                <span className="camera-batch-frame-corner is-br" />
                {guideStrip && (
                  <>
                    <img className="camera-batch-guide" src={guideStrip} alt="" />
                    <span className="camera-batch-guide-label">
                      {t('dev_camera_batch_msg_align_guide')}
                    </span>
                  </>
                )}
              </div>
            )}
            {!isLive && (
              <span className="camera-batch-stage-hint">{t('dev_camera_batch_status_idle')}</span>
            )}
          </div>

          {/* Capture stays glued to the preview: scrolling down to find it used to
              push the image out of view. */}
          <div className="camera-batch-capture-bar">
            <button
              type="button"
              className="btn btn-primary btn-full btn-lg"
              onClick={capture}
              disabled={!isLive || capReached}
            >
              {t('dev_camera_batch_btn_capture')}
            </button>
          </div>

          {isLive && photoCount > 0 && !guideStrip && (
            <p className="camera-batch-error">{t('dev_camera_batch_msg_guide_missing')}</p>
          )}

          <p className={`camera-batch-status ${isLive ? 'is-live' : 'is-idle'}`}>
            {isLive ? t('dev_camera_batch_status_live') : t('dev_camera_batch_status_idle')}
          </p>

          {settings && (
            <dl className="camera-batch-meta">
              <dt>{t('dev_camera_batch_label_stream_resolution')}</dt>
              <dd>
                {settings.width ?? '?'} x {settings.height ?? '?'}
              </dd>
              {settings.facingMode && (
                <>
                  <dt>facingMode</dt>
                  <dd>{settings.facingMode}</dd>
                </>
              )}
              {settings.deviceId && (
                <>
                  <dt>deviceId</dt>
                  <dd>{settings.deviceId}</dd>
                </>
              )}
            </dl>
          )}

          {videoInfo && (
            <dl className="camera-batch-meta">
              <dt>{t('dev_camera_batch_label_video')}</dt>
              <dd>
                {videoInfo.videoWidth} x {videoInfo.videoHeight}
              </dd>
              <dt>paused / readyState</dt>
              <dd>
                {String(videoInfo.paused)} / {videoInfo.readyState}
              </dd>
              {videoInfo.playError && (
                <>
                  <dt>{t('dev_camera_batch_label_errors')}</dt>
                  <dd className="camera-batch-error">{videoInfo.playError}</dd>
                </>
              )}
            </dl>
          )}

          {cameraErrorMessage && <p className="camera-batch-error">{cameraErrorMessage}</p>}

          <div className="camera-batch-actions">
            <button type="button" className="btn btn-outline btn-full" onClick={openCamera}>
              {t('dev_camera_batch_btn_open_camera')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={finish}
              disabled={!isLive && captureCount === 0}
            >
              {t('dev_camera_batch_btn_done')}
            </button>
          </div>

          {capReached && <p className="camera-batch-note">{t('dev_camera_batch_msg_cap_reached')}</p>}
        </>
      ) : (
        <section className="camera-batch-report-block">
          <pre className="camera-batch-report">{buildReport(platform, videoInfo, captures, send)}</pre>
          <div className="camera-batch-actions">
            <button type="button" className="btn btn-primary btn-full" onClick={copyReport}>
              {t('dev_camera_batch_btn_copy_report')}
            </button>
            <button type="button" className="btn btn-outline btn-full" onClick={openCamera}>
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

        {captures.length === 0 && <p className="camera-batch-note">-</p>}
        <ul className="camera-batch-thumbs">
          {captures.map(item => (
            <li key={item.record.index} className="camera-batch-thumb">
              {item.url ? (
                <img src={item.url} alt={item.fileName} className="camera-batch-thumb-img" />
              ) : (
                <div className="camera-batch-thumb-img is-empty">{item.fileName}</div>
              )}
              <dl className="camera-batch-meta">
                <dt>{t('dev_camera_batch_label_stream_resolution')}</dt>
                <dd>
                  {item.record.streamWidth ?? '?'} x {item.record.streamHeight ?? '?'}
                </dd>
                <dt>{t('dev_camera_batch_label_capture_dimensions')}</dt>
                <dd>
                  {item.record.width} x {item.record.height}
                </dd>
                <dt>{t('dev_camera_batch_label_blob_size')}</dt>
                <dd>
                  {item.record.blobSize} B / {formatKb(item.record.blobSize)} KB
                  {item.record.durationMs == null ? '' : ` / ${item.record.durationMs} ms`}
                </dd>
                <dt>type</dt>
                <dd>{item.record.mimeType}</dd>
                {item.record.error && (
                  <>
                    <dt>{t('dev_camera_batch_label_errors')}</dt>
                    <dd className="camera-batch-error">{item.record.error}</dd>
                  </>
                )}
              </dl>
              <button
                type="button"
                className="btn btn-danger btn-full"
                onClick={() => removeCapture(item.record.index)}
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
