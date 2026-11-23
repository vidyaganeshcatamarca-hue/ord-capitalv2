// src/ocr/camera/useFramedCamera.ts
// ============================================
// OCR - Framed camera engine (captures + travel meter)
// ============================================
//
// Everything about the camera and the captures lives here, and NOTHING about
// the product UI does: no JSX, no labels, no copy, no toast. A screen decides
// how it looks; this hook decides what is true.
//
// Three responsibilities, in order of importance:
//
// 1. THE STREAM. Open with `facingMode: environment` at 1920x1080 ideals, keep
//    the REAL track settings so a caller can report them, stop every track on
//    close and on unmount. A camera light left on is a privacy bug, not a
//    cosmetic one.
//
// 2. THE CAPTURES. canvas draw + `toBlob('image/jpeg', 0.92)` per shot, an
//    object URL per shot, an optional callback for hosts that need to log the
//    shot. `files` is the CONTRACT SURFACE: the same `File[]`, in capture
//    order, that the existing OCR flow already consumes. The OCR contract does
//    not change because the camera changed.
//
// 3. THE TRAVEL METER. How far the camera moved down the receipt since the last
//    capture, as one number. It ADVISES and NEVER gates: `capture()` refuses
//    only on the photo cap, never on the meter.
//
// SECOND PLANE. A phone that locks the screen, or a tab the user backgrounds,
// kills the tracks without asking. The hook stops the tracks itself on
// `visibilitychange` to hidden, and on return makes exactly ONE automatic
// resume attempt. If that fails, `needsResume` turns true and the surface
// shows a button: retrying forever is how a camera app burns a battery in a
// pocket.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  accumulateTravel,
  classifyTravel,
  estimateVerticalShiftDetailed,
  travelPercent,
  verticalProfile,
  type TravelVerdict,
} from './displacement'
import { frameSharpness } from './sharpness'
import { sweepFocus } from './focus'

/** Product cap for one ticket: the OCR flow accepts up to 10 pages. */
export const MAX_CAPTURES = 10

/** JPEG quality of every capture: high enough for OCR, small enough to upload. */
/* 0.90: small text is what OCR has to read, and the encoder is no longer the
   bottleneck once the canvas is reused and the meter pauses during a shot. */
const JPEG_QUALITY = 0.9

/** Ideal stream: the OCR backend needs the resolution, not the aspect ratio. */
/*
 * Portrait 9:16, which is what this rear camera actually delivers: asking for
 * 1440x1920 made the device hand back a LANDSCAPE mode, and a horizontal stream
 * cannot fill a phone's height -- it letterboxed inside the box with black bands
 * above and below.
 *
 * The old problem with 9:16 was not the shape, it was the space: at ~390 px of
 * usable height, `width = height * 0.56` gave a preview 219 px wide. With the
 * capture sheet now taking the full screen there are ~640 px for the viewfinder,
 * so the same 9:16 shape yields ~360 px of width (94% of a 385 px phone) AND
 * ~75% of the screen height. The shape was never the problem.
 */
const IDEAL_WIDTH = 1920
const IDEAL_HEIGHT = 1080

/**
 * Cadence of the displacement meter: 125 ms is eight samples a second, fast
 * enough to follow a moving hand. It was 200 ms, which made each step larger and
 * pushed real movements out of the narrow search window (a whole sample
 * rejected), so the meter undercounted. Smaller steps also mean less lag: the
 * number catches up with the hand in a quarter of a second.
 */
const SHIFT_SAMPLE_INTERVAL_MS = 125
/**
 * Downscaled sampler for the displacement meter. 120 x 480 is the whole point
 * of this rewrite: a 1920 px tall stream squeezed into 480 profile rows means
 * ONE profile row is 4 real pixels, so a ~30 px printed line spans ~7-8 rows
 * and the receipt's periodicity is resolvable. At 240 rows one row was 8 real
 * pixels and a line spanned ~4, which aliased the signal and gave the
 * correlation dozens of near-identical peaks. Never go below 480 rows.
 *
 * The caps are independent (no aspect ratio): the profile only needs ROWS, so
 * the frame is squashed horizontally. Keeping the aspect ratio would cap a
 * 1080x1920 stream at ~213 rows, right back on the alias.
 */
const SHIFT_SAMPLE_MAX_WIDTH = 120
const SHIFT_SAMPLE_MAX_HEIGHT = 480
/**
 * Share of the frame width dropped on EACH side before sampling.
 *
 * The profile averages a whole row, so every column that is not receipt dilutes
 * the signal. On a phone held over a supermarket ticket the outer 12% of each
 * side is the table, the operator's hand or the shop behind the paper: content
 * with its own vertical structure, unrelated to the receipt, that the
 * correlation will happily try to align. Cropping to the central band keeps the
 * measurement inside the paper. There is no ticket detection and no
 * thresholding on purpose: it is a fixed band, and the framing box already asks
 * the operator to fill it.
 */
const SHIFT_SAMPLE_SIDE_CROP_RATIO = 0.12
/**
 * Search window per side, as a share of ONE frame's rows: 12% per 125 ms sample
 * is far above normal hand movement and small enough that the frame-to-frame
 * peak cannot reach the neighbouring identical line.
 *
 * KEEP IT. If the phone test still shows UNDERCOUNTING because real steps exceed
 * this window (whole samples rejected as too wide), the next step is 80-100 ms
 * per sample so each step is smaller -- NOT a wider window, which would let the
 * peak reach the next identical receipt line and destroy the reason this design
 * works at all.
 */
const SHIFT_MAX_STEP_RATIO = 0.12
/**
 * Smoothing of the DISPLAYED percentage (the offset itself stays exact). The
 * number must not flicker between neighbouring values while the operator is
 * moving: alpha 0.5 follows a real move in a sample or two and still hides a
 * single line-height wobble. It was 0.35, which lagged the operator enough that
 * the number read behind the paper he could see.
 *
 * The displayed value DECREASES when the operator comes back up the receipt.
 * It has to: the real position goes back, and a number that only ever grows
 * reports an overlap that is no longer there.
 */
const SHIFT_DISPLAY_ALPHA = 0.5
/**
 * Measured travel -> physical travel. Calibrated on the owner's phone: the meter
 * reached 70% of the bar when the receipt had already moved one full frame, so
 * every reading is scaled by 100/70. The measurement itself is unchanged; only
 * the number the operator reads is corrected. If another device shows a
 * different bias, this single constant is what gets adjusted.
 */
const TRAVEL_CALIBRATION = 100 / 70
/**
 * Entering "ready": travel that leaves ~30% overlap with the last capture.
 */
const TARGET_SHIFT_PERCENT = 70
/**
 * Leaving "ready". The two thresholds are deliberate (hysteresis): with a single
 * one, a hand resting near the target makes the red pulse stutter on and off at
 * the sampling rate, and the operator -- who is looking at the paper, not the
 * screen -- reads that as a broken meter. Between 65 and 70 the previous state
 * holds, so the target has to be genuinely lost to lose the pulse.
 */
const READY_EXIT_PERCENT = 65

/** Where the camera is, from the caller's point of view. */
export type CameraStatus =
  /** No stream and nothing running: the normal resting state. */
  | 'idle'
  /** `getUserMedia` is in flight. The permission prompt may be on screen. */
  | 'opening'
  /** A stream exists; captures and the meter are usable. */
  | 'live'
  /** Tracks were stopped because the page went to the background. */
  | 'suspended'
  /** The stream could not be opened, or a resume attempt failed. */
  | 'error'

/** Why the camera is unavailable, in the three shapes the UI distinguishes. */
export type CameraErrorCode = 'no_camera' | 'permission_denied' | 'camera_error'

/**
 * One shot of the batch.
 *
 * `blob`/`url` are null when the shot FAILED (no 2d context, no video
 * dimensions, `toBlob` returned null): a failed shot keeps its record so the
 * host can show why, and is excluded from `files` because it has no bytes.
 *
 * The `stream*` fields are the track settings at capture time, not the canvas
 * size: the spike's whole question is whether the REAL camera resolution was
 * enough, so they are recorded per shot instead of once per session.
 *
 * `index` is the page number and also the stable identity of the shot. A
 * deleted page is never renumbered, so `index` can be the React key and the
 * argument of `remove()`.
 */
export type CameraCapture = {
  index: number
  fileName: string
  blob: Blob | null
  url: string | null
  streamWidth: number | null
  streamHeight: number | null
  facingMode: string | null
  deviceId: string | null
  /** Canvas dimensions of the capture: the pixels that actually got encoded. */
  width: number
  height: number
  /** `blob.size` in bytes; 0 for a failed shot. */
  bytes: number
  mimeType: string
  /** Encode time of this shot, in ms. */
  durationMs: number | null
  error: string | null
}

/**
 * What the `<video>` element is REALLY doing. The preview can be invisible
 * while the canvas still captures, so this is the only way to tell them apart,
 * and a host that reports a broken preview needs it.
 */
export type VideoInfo = {
  width: number
  height: number
  paused: boolean
  readyState: number
  playError: string | null
}

/**
 * One meter sample, verbatim: what it measured and what the accumulator did
 * with it. A rejected sample and a genuinely short movement look identical in
 * the percentage alone, so a calibration host needs this to tell them apart.
 * A product surface ignores it.
 */
export type TravelSample = {
  /** Frame-to-frame estimate in sampler rows; null when nothing was measured. */
  shift: number | null
  /** Winning normalised correlation, -1..1; null when nothing was measured. */
  score: number | null
  verdict: TravelVerdict
  /** Rows this sample moved the offset by; 0 whenever it was not applied. */
  delta: number
  offset: number
  rows: number
  percent: number
  ready: boolean
}

/** The meter, as a screen needs it. Never null: 0% is a real reading. */
export type TravelState = {
  /** Smoothed travel since the last capture, 0..100. Can go DOWN. */
  percent: number
  /** False until a capture exists: with no page captured there is no page. */
  armed: boolean
  /** Hysteresis state: the "you can capture now" condition. */
  ready: boolean
  /** Last sample, or null before the first measurable one. */
  sample: TravelSample | null
}

/** The focus request a tap on the preview turns into, in 0..1 coordinates. */
export type FocusPoint = { x: number; y: number }

export type UseFramedCameraOptions = {
  /** Page cap for one ticket. Defaults to the OCR contract's 10. */
  maxCaptures?: number
  /**
   * Called once per capture that was ADDED, successful or not, so a diagnostic
   * host can log the record. The hook itself never logs: a product surface must
   * not write to the console.
   */
  onCapture?: (capture: CameraCapture) => void
}

export type UseFramedCameraResult = {
  status: CameraStatus
  error: CameraErrorCode | null
  stream: MediaStream | null
  /** Real settings of the live video track, or null when there is no track. */
  settings: MediaTrackSettings | null
  /** The element the stream is attached to. Read by the capture pipeline. */
  videoRef: RefObject<HTMLVideoElement | null>
  /** Attach this to the `<video>`: it survives the element unmounting. */
  attachVideo: (element: HTMLVideoElement | null) => void
  videoInfo: VideoInfo | null
  /** Shots in capture order, failures included. */
  captures: CameraCapture[]
  /**
   * The shots that produced bytes, in capture order, as `File[]`. THIS is what
   * the OCR flow consumes; it is the same shape the file input produces.
   */
  files: File[]
  count: number
  /** Focus now, generically: walks the distance range the device declares and
   *  keeps the sharpest stop. False when the device gives nothing to walk. */
  autoFocus: () => Promise<boolean>
  /** True while a sweep is running; the surface disables the shutter meanwhile. */
  focusing: boolean
  capReached: boolean
  /** True when a capture would be accepted right now. Never gated by travel. */
  canCapture: boolean
  /** The one automatic resume after a background trip failed: ask the user. */
  needsResume: boolean
  travel: TravelState
  open: () => Promise<void>
  /**
   * Stops every track and leaves the captures ALONE by default: a host that
   * still needs the photos (a report screen, a pending upload) must not lose
   * them. Pass `{ discardCaptures: true }` to also revoke every object URL and
   * drop the blobs, which is what a finished flow does.
   */
  close: (options?: { discardCaptures?: boolean }) => void
  /**
   * One clean resume attempt. Returns whether a live stream exists afterwards;
   * never retries on its own.
   */
  resume: () => Promise<boolean>
  capture: () => void
  /** Delete one shot and revoke its object URL. */
  remove: (index: number) => void
  /** Drop every shot and revoke every object URL. Keeps the camera running. */
  clear: () => void
  /**
   * Tap-to-focus. Applies continuous autofocus, or a point of interest when the
   * device only supports that. Returns whether a constraint was applied;
   * NEVER throws, because a device that cannot focus still has to capture.
   */
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

/** The three shapes the UI distinguishes; everything else is a camera error. */
function mapCameraError(error: unknown): CameraErrorCode {
  const name = error instanceof DOMException ? error.name : ''
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'permission_denied'
    : 'camera_error'
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

/**
 * The camera and the captures of one framed batch.
 *
 * The hook is the only owner of the stream: there is exactly one exit path for
 * tracks (`stopTracks`) and exactly one exit path for object URLs
 * (`revokeUrl`/`discardCaptures`), so neither can outlive the component.
 */
export function useFramedCamera(options: UseFramedCameraOptions = {}): UseFramedCameraResult {
  const maxCaptures = options.maxCaptures ?? MAX_CAPTURES
  const onCaptureRef = useRef(options.onCapture)
  onCaptureRef.current = options.onCapture

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const nextIndexRef = useRef(1)
  const mountedRef = useRef(true)
  const statusRef = useRef<CameraStatus>('idle')
  /** The captures, mirrored synchronously: `capture()` decides the cap with the
   *  value it can see NOW, not with the value of the last render. */
  const capturesRef = useRef<CameraCapture[]>([])
  /** One automatic resume per background trip. Reset when the page hides and
   *  when the user explicitly opens the camera. */
  const autoResumeAttemptedRef = useRef(false)
  /** Every `startStream` call takes a new generation. A `getUserMedia` promise
   *  that resolves after a newer call (or after a close) must DROP its stream
   *  instead of adopting it: two live streams on one screen is a camera light
   *  nobody can turn off. */
  const generationRef = useRef(0)

  /** Downscaled offscreen canvas for the displacement meter, reused on every
   *  tick: one 120x480 buffer, never the full frame. */
  const samplerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /* One capture canvas for the whole session. Allocating a fresh 1080x1920 canvas
     per shot costs an 8 MB surface on Android before a single pixel is drawn. */
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /* The travel meter and the shot compete for the same thread: the interval is
     silenced for a moment after a tap so the encoder gets the CPU it needs. */
  const meterPausedUntilRef = useRef(0)
  const focusingRef = useRef(false)
  const focusCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /* Focus pulses queued after a tap; cleared with the stream. */
  const focusTimersRef = useRef<number[]>([])
  /** The PREVIOUS sample's row profile. The meter measures frame to frame, not
   *  against a fixed reference: the accumulation lives in the offset below, so
   *  travelling away from the capture frame cannot dilute the signal. Reset on
   *  capture, on open and on any frame that cannot be read. */
  const prevProfileRef = useRef<Float32Array | null>(null)
  /** Exact net travel down the receipt since the last capture, in sampler rows. */
  const travelOffsetRef = useRef(0)
  /** Smoothed percentage on screen, 0..100. It can go DOWN: the real position
   *  goes back when the operator comes back up the receipt. */
  const shownPercentRef = useRef(0)
  /** The hysteresis state of the meter, kept outside React so a sample decides
   *  with the value it just computed instead of a stale render. `true` = the
   *  red "you can capture now" state. */
  const shiftReadyRef = useRef(false)
  /** The meter is INACTIVE until the first capture: with no page captured there
   *  is no page to travel down, so nothing is estimated. */
  const meterArmedRef = useRef(false)

  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<CameraErrorCode | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [settings, setSettings] = useState<MediaTrackSettings | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [captures, setCaptures] = useState<CameraCapture[]>([])
  /* True while the software autofocus sweep is walking distances. */
  const [focusing, setFocusing] = useState(false)
  const [needsResume, setNeedsResume] = useState(false)
  const [travel, setTravel] = useState<TravelState>({
    percent: 0,
    armed: false,
    ready: false,
    sample: null,
  })

  /** Status has to be readable from a timer or a listener without waiting for a
   *  render, or a background event decides on a stale value. */
  const commitStatus = useCallback((next: CameraStatus) => {
    statusRef.current = next
    if (mountedRef.current) setStatus(next)
  }, [])

  /** The ONE place captures change: keeps the synchronous mirror in step. */
  const commitCaptures = useCallback((next: CameraCapture[]) => {
    capturesRef.current = next
    if (mountedRef.current) setCaptures(next)
  }, [])

  /**
   * Single exit path for the media stream: no track can outlive the page. It
   * does NOT touch the status, so a caller can decide whether the stop means
   * "closed", "suspended" or "restarting".
   */
  const stopTracks = useCallback(() => {
    // A queued focus pulse must not fire against a stopped track.
    for (const id of focusTimersRef.current) window.clearTimeout(id)
    focusTimersRef.current = []
    const current = streamRef.current
    if (current) {
      for (const track of current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (!mountedRef.current) return
    setStream(null)
    setSettings(null)
    setVideoInfo(null)
  }, [])

  const revokeUrl = useCallback((url: string | null) => {
    if (url === null) return
    URL.revokeObjectURL(url)
    objectUrlsRef.current.delete(url)
  }, [])

  /**
   * The ONE reset point of the meter: exact offset, displayed value and the
   * frame-to-frame baseline go back to zero together, because keeping any of
   * them would make the next page start from the previous page's travel.
   *
   * `armed` is the only difference between the ways in: `false` is "waiting for
   * the first photo" (open, close, unmount) and `true` is "a photo exists,
   * measure the next page" (capture, and a resume that still has photos).
   */
  const resetMeter = useCallback((armed: boolean) => {
    prevProfileRef.current = null
    travelOffsetRef.current = 0
    shownPercentRef.current = 0
    shiftReadyRef.current = false
    meterArmedRef.current = armed
    if (!mountedRef.current) return
    setTravel({ percent: 0, armed, ready: false, sample: null })
  }, [])

  /** Drops every shot and every object URL. The camera keeps running. */
  const discardCaptures = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url)
    objectUrlsRef.current.clear()
    nextIndexRef.current = 1
    commitCaptures([])
  }, [commitCaptures])

  // Unmount: stop the tracks (silent, the component is gone) and release every
  // object URL so the blobs become collectable. The meter goes with them, so no
  // sampler can resume on a dead component.
  useEffect(() => {
    mountedRef.current = true
    const urls = objectUrlsRef.current
    return () => {
      mountedRef.current = false
      prevProfileRef.current = null
      travelOffsetRef.current = 0
      shownPercentRef.current = 0
      shiftReadyRef.current = false
      meterArmedRef.current = false
      stopTracks()
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [stopTracks])

  /**
   * The stream is attached here (never through JSX props) so React cannot drop
   * srcObject on a re-render. `videoInfo` is the preview's only source of
   * truth: a paused or zero-sized <video> means the user sees nothing even
   * though canvas.drawImage keeps producing frames.
   *
   * Keyed on the ELEMENT as well as the stream: a host that swaps views
   * unmounts the <video> and the new element needs the stream again.
   */
  useEffect(() => {
    const video = videoElement
    if (!video) return
    if (!stream) {
      video.srcObject = null
      if (mountedRef.current) setVideoInfo(null)
      return
    }

    const sync = (playError: string | null) => {
      if (!mountedRef.current) return
      setVideoInfo({
        width: video.videoWidth,
        height: video.videoHeight,
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
  }, [stream, videoElement])

  /** Stable ref callback: a fresh identity every render would detach and
   *  re-attach the video on every sample of the meter. */
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    setVideoElement(element)
  }, [])

  /**
   * One sample of the live frame -> row profile -> frame-to-frame displacement
   * -> NET offset. Nothing here gates the capture button and nothing here hides
   * the meter: an unmeasurable frame keeps the last reading.
   */
  const sampleTravel = useCallback(() => {
    if (!mountedRef.current) return
    // A shot is being encoded right now: every millisecond here is a millisecond
    // the operator waits between the tap and the photo.
    if (performance.now() < meterPausedUntilRef.current) return
    // Before the first capture there is no page to measure: no estimation work
    // at all, the meter sits on its waiting state.
    if (!meterArmedRef.current) return
    const video = videoRef.current
    if (!video) return
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (sourceWidth === 0 || sourceHeight === 0) return

    // Only the central band reaches the sampler: the outer 12% of each side is
    // table, hand or shop, not receipt. `sx`/`sw` crop the SOURCE, and the
    // cropped width is what gets downscaled, so the band fills the canvas.
    const sideCrop = Math.round(sourceWidth * SHIFT_SAMPLE_SIDE_CROP_RATIO)
    const bandWidth = Math.max(1, sourceWidth - sideCrop * 2)
    const width = Math.max(1, Math.min(SHIFT_SAMPLE_MAX_WIDTH, bandWidth))
    const height = Math.max(1, Math.min(SHIFT_SAMPLE_MAX_HEIGHT, sourceHeight))

    let canvas = samplerCanvasRef.current
    if (canvas === null) {
      canvas = document.createElement('canvas')
      samplerCanvasRef.current = canvas
    }
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    let profile: Float32Array
    try {
      ctx.drawImage(video, sideCrop, 0, bandWidth, sourceHeight, 0, 0, width, height)
      profile = verticalProfile(ctx.getImageData(0, 0, width, height).data, width, height)
    } catch {
      // A tainted, locked or not-yet-painted frame: drop the BASELINE so the
      // next good tick starts a fresh comparison. The offset and the reading
      // stay: one bad sample is not a reset.
      prevProfileRef.current = null
      return
    }
    if (profile.length === 0 || !mountedRef.current) return

    const rows = profile.length
    const previous = prevProfileRef.current
    // The new profile becomes the baseline immediately: this is a frame-to-frame
    // measurement, so there is never a fixed reference to drift away from. The
    // very first sample after a capture only seeds it.
    prevProfileRef.current = profile
    if (previous === null || previous.length !== rows) return

    const maxStep = Math.max(4, Math.round(rows * SHIFT_MAX_STEP_RATIO))
    // The detailed estimate is the SAME search: it only also hands back the
    // correlation score, which a calibration host needs and the meter ignores.
    const estimate = estimateVerticalShiftDetailed(previous, profile, maxStep)
    const shift = estimate === null ? null : estimate.shift
    // A null estimate (or a rejected one) leaves the offset exactly where it
    // was: the operator never sees the meter fall back to 0.
    const offset = accumulateTravel(travelOffsetRef.current, shift, rows, maxStep)
    travelOffsetRef.current = offset
    if (!mountedRef.current) return

    // One full frame of travel is one page, so the percentage is the offset over
    // the sampler rows, corrected by the device calibration. The offset is exact;
    // only the number on screen is smoothed. It is allowed to DECREASE: coming
    // back up the receipt undoes travel, and a number that only grew would
    // advertise an overlap that is no longer there.
    const percent = travelPercent(offset, rows, TRAVEL_CALIBRATION)
    const smoothed =
      shownPercentRef.current + SHIFT_DISPLAY_ALPHA * (percent - shownPercentRef.current)
    const shown = Math.min(100, Math.max(0, Math.round(smoothed)))
    shownPercentRef.current = shown

    // Hysteresis, decided on the SMOOTHED value: enter the ready state at the
    // target, leave it only well below it. Between the two thresholds the
    // previous state holds, so a hand resting near 70% cannot make the state
    // stutter. Callers follow this boolean, never the raw number.
    const wasReady = shiftReadyRef.current
    const ready = wasReady ? shown >= READY_EXIT_PERCENT : shown >= TARGET_SHIFT_PERCENT
    shiftReadyRef.current = ready

    const applied = classifyTravel(shift, rows, maxStep)
    setTravel({
      percent: shown,
      armed: meterArmedRef.current,
      ready,
      sample: {
        shift,
        score: estimate === null ? null : estimate.score,
        verdict: applied.verdict,
        delta: applied.delta,
        offset,
        rows,
        percent: shown,
        ready,
      },
    })
  }, [])

  // The meter's lifetime is the stream's lifetime. The cleanup owns the
  // interval, so no tick survives a lost stream, a backgrounded page or the
  // unmount of the host.
  useEffect(() => {
    if (status !== 'live') return
    const timer = window.setInterval(sampleTravel, SHIFT_SAMPLE_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [status, sampleTravel])

  /**
   * The one way a stream is opened. `armed` is what the meter becomes once the
   * stream is live: `false` for a fresh run (waiting for the first photo) and
   * `captures.length > 0` when a resume happens mid-page, so the meter does not
   * forget that a page was already captured.
   */
  const startStream = useCallback(
    async (armed: boolean): Promise<boolean> => {
      if (!mountedRef.current) return false
      stopTracks()
      setError(null)
      commitStatus('opening')

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('no_camera')
        commitStatus('error')
        return false
      }

      try {
        const generation = generationRef.current + 1
        generationRef.current = generation
        const next = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: IDEAL_WIDTH },
            height: { ideal: IDEAL_HEIGHT },
            /* Ask for continuous autofocus from the first frame: a ticket held
               close is exactly the case where a fixed-focus stream looks blurry.
               Devices that ignore it simply keep their own behaviour. */
            advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
          },
          audio: false,
        })
        // The page may have closed while the permission prompt was open, or a
        // newer attempt may have started: a stream nobody can see must still be
        // released.
        if (!mountedRef.current || generation !== generationRef.current) {
          for (const track of next.getTracks()) track.stop()
          return false
        }
        streamRef.current = next
        setStream(next)
        setSettings(next.getVideoTracks()[0]?.getSettings() ?? null)
        commitStatus('live')
        resetMeter(armed)

        return true
      } catch (err) {
        if (!mountedRef.current) return false
        setError(mapCameraError(err))
        commitStatus('error')
        return false
      }
    },
    [commitStatus, resetMeter, stopTracks],
  )

  /** Explicit open: a NEW run, so the meter waits for the first photo. */
  const open = useCallback(async () => {
    autoResumeAttemptedRef.current = false
    setNeedsResume(false)
    await startStream(false)
  }, [startStream])

  /** One clean attempt, never a loop: the caller decides whether to offer a
   *  button. The meter keeps its armed state when photos already exist. */
  const resume = useCallback(async () => {
    setNeedsResume(false)
    const ok = await startStream(capturesRef.current.length > 0)
    if (!ok && mountedRef.current) setNeedsResume(true)
    return ok
  }, [startStream])

  const close = useCallback(
    (closeOptions?: { discardCaptures?: boolean }) => {
      autoResumeAttemptedRef.current = false
      // Abandons an in-flight `getUserMedia`: if it resolves later it must not
      // adopt a stream the user already closed.
      generationRef.current += 1
      stopTracks()
      resetMeter(false)
      setNeedsResume(false)
      setError(null)
      commitStatus('idle')
      if (closeOptions?.discardCaptures) discardCaptures()
    },
    [commitStatus, discardCaptures, resetMeter, stopTracks],
  )

  const clear = useCallback(() => {
    discardCaptures()
  }, [discardCaptures])

  /**
   * SECOND PLANE. A backgrounded page keeps no track: on some phones the camera
   * light stays on, on others the track dies silently and every later capture
   * encodes a frozen frame. Stopping is the only behaviour that is correct on
   * both.
   *
   * On return there is exactly ONE automatic attempt. If it fails, the user is
   * asked with a button instead of the hook hammering `getUserMedia` in a
   * pocket.
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        autoResumeAttemptedRef.current = false
        if (streamRef.current === null) return
        stopTracks()
        resetMeter(capturesRef.current.length > 0)
        commitStatus('suspended')
        return
      }

      if (statusRef.current !== 'suspended') return
      if (autoResumeAttemptedRef.current) return
      autoResumeAttemptedRef.current = true
      void resume()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [commitStatus, resetMeter, resume, stopTracks])

  /**
   * Draws the current video frame into a full-size canvas and encodes it as
   * JPEG. Nothing about the meter is read here: a capture is allowed at any
   * travel, on purpose.
   *
   * The capture ORDER is the array order, and the file name (`batch-<n>.jpg`)
   * follows the page number: the OCR backend sees the pages of one ticket in
   * the order they were taken.
   */
  const capture = useCallback(() => {
    const video = videoRef.current
    const current = streamRef.current
    if (!video || !current) return
    if (capturesRef.current.length >= maxCaptures) return

    // The page just captured is the page that was travelled: the next shot
    // measures ITS OWN travel from its own frame, so the accumulation, the
    // displayed value and the frame-to-frame baseline all start over. The meter
    // stays armed: keep going down the same receipt.
    resetMeter(true)

    const index = nextIndexRef.current
    nextIndexRef.current += 1
    const fileName = `batch-${index}.jpg`
    const startedAt = performance.now()
    const trackSettings = current.getVideoTracks()[0]?.getSettings()
    const base = {
      index,
      fileName,
      streamWidth: trackSettings?.width ?? null,
      streamHeight: trackSettings?.height ?? null,
      facingMode: trackSettings?.facingMode ?? null,
      deviceId: trackSettings?.deviceId ?? null,
    }

    const width = video.videoWidth
    const height = video.videoHeight

    /** A shot that produced no bytes keeps its record so the host can explain
     *  the gap, and never reaches `files`. */
    const failed = (message: string) => {
      const record: CameraCapture = {
        ...base,
        width,
        height,
        bytes: 0,
        mimeType: 'image/jpeg',
        durationMs: Math.round(performance.now() - startedAt),
        error: message,
        blob: null,
        url: null,
      }
      commitCaptures([...capturesRef.current, record])
      onCaptureRef.current?.(record)
    }

    if (width === 0 || height === 0) {
      failed('video has no dimensions yet')
      return
    }

    // Give the encoder a clean window: no sampler tick until this shot is done.
    meterPausedUntilRef.current = performance.now() + 700

    let canvas = captureCanvasRef.current
    if (canvas === null) {
      canvas = document.createElement('canvas')
      captureCanvasRef.current = canvas
    }
    const sized = canvas.width === width && canvas.height === height
    if (!sized) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      failed('2d context unavailable')
      return
    }
    // A resized canvas clears itself, so the wipe is only needed while reusing it.
    if (sized) ctx.clearRect(0, 0, width, height)

    try {
      ctx.drawImage(video, 0, 0, width, height)
    } catch (err) {
      failed(`drawImage failed: ${describeError(err)}`)
      return
    }

    canvas.toBlob(
      blob => {
        // The host may have closed the surface while the encoder was working:
        // a blob nobody owns is a leak, and a late setState is a warning.
        if (!mountedRef.current) return
        const durationMs = Math.round(performance.now() - startedAt)

        if (!blob) {
          failed('canvas.toBlob returned null')
          return
        }

        const url = URL.createObjectURL(blob)
        objectUrlsRef.current.add(url)
        const record: CameraCapture = {
          ...base,
          width,
          height,
          bytes: blob.size,
          mimeType: blob.type || 'image/jpeg',
          durationMs,
          error: null,
          blob,
          url,
        }
        commitCaptures([...capturesRef.current, record])
        onCaptureRef.current?.(record)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  }, [commitCaptures, maxCaptures, resetMeter])

  /** Deleting a page releases its object URL: the blob must become collectable
   *  the moment the operator says it is gone. */
  const remove = useCallback(
    (index: number) => {
      const target = capturesRef.current.find(item => item.index === index)
      if (target === undefined) return
      revokeUrl(target.url)
      commitCaptures(capturesRef.current.filter(item => item.index !== index))
    },
    [commitCaptures, revokeUrl],
  )

  /**
   * Focus, generically and without assuming a device.
   *
   * The web platform will not run a focus cycle on demand here (`single-shot` is
   * accepted and ignored, confirmed twice on the owner's phone), and a receipt is
   * held somewhere between 10 and 50 cm. What the platform DOES report is
   * `focusDistance` as a range. So: walk that range, measure the frame at each
   * stop, stay where it is sharpest. Units are never interpreted -- min/max are
   * used as reported, so the same code runs on metres and on dioptres.
   *
   * Returns false when the device offers nothing to walk; the caller then keeps
   * its own autofocus and promises nothing.
   */
  const autoFocus = useCallback(async (): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || focusingRef.current) return false
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return false

    /* The sweep is a pause: the travel meter must not steal the thread while the
       lens is being measured. 3 stops × 150ms is the whole budget. */
    meterPausedUntilRef.current = performance.now() + 2000

    try {
      let canvas = focusCanvasRef.current
      if (canvas === null) {
        canvas = document.createElement('canvas')
        focusCanvasRef.current = canvas
      }
      const width = 160
      const height = 280
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx === null) return false

      const measure = (): number => {
        try {
          ctx.drawImage(video, 0, 0, width, height)
          const data = ctx.getImageData(0, 0, width, height).data
          return frameSharpness(data, width, height)
        } catch {
          return 0
        }
      }

      const result = await sweepFocus({ track, measure, steps: 6, settleMs: 220 })
      // A device with nothing to walk keeps its own autofocus; nothing is claimed.
      if (!result.supported) return false
      return result.applied
    } finally {
      focusingRef.current = false
      setFocusing(false)
    }
  }, [])

  /** The contract surface: only shots that produced bytes, in capture order. */
  const files = useMemo(
    () =>
      captures
        .filter((item): item is CameraCapture & { blob: Blob } => item.blob !== null)
        .map(item => new File([item.blob], item.fileName, { type: item.mimeType || 'image/jpeg' })),
    [captures],
  )

  const count = captures.length

  return {
    status,
    error,
    stream,
    settings,
    videoRef,
    attachVideo,
    videoInfo,
    captures,
    files,
    count,
    autoFocus,
    focusing,
    capReached: count >= maxCaptures,
    canCapture: status === 'live' && count < maxCaptures,
    needsResume,
    travel,
    open,
    close,
    resume,
    capture,
    remove,
    clear,
  }
}
