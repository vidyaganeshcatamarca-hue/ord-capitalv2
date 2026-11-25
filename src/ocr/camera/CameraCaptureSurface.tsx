// src/ocr/camera/CameraCaptureSurface.tsx
// ============================================
// OCR - Framed camera capture surface (product grade)
// ============================================
//
// The screen the operator holds over a receipt: a framed preview, one big
// shutter, and a single piece of guidance (how far to keep moving down the
// paper). Every measurement, every track and every object URL belongs to
// `useFramedCamera`; this file only decides what the operator sees.
//
// WHAT IT DELIBERATELY DOES NOT SHOW: resolution, facing mode, device id,
// correlation scores, offsets, deltas, sampling intervals, calibration factors,
// percentages. Those are the calibration spike's job (`/dev/camera-batch`), not
// the product's. A readout on this screen means the operator reads numbers
// instead of the paper. The travel meter survives only as a bar plus one short
// sentence, which is what "how far do I keep moving" needs and nothing more.
//
// ONE JOB: this surface is the camera, and it is a SUB-STEP the host opens on
// purpose -- the parent already asked "camera, gallery or PDF?" before mounting
// this. That is why there is no "open camera" step inside: mounting it IS the
// intent to photograph, so the stream starts by itself. Gallery and PDF stay the
// parent's sources and are never rendered here.
//
// ONE PRIMARY ACTION: `Enviar`. It replaces the old "Done" button, which forced
// the operator through a second screen to find a second button for the same
// batch. "Enviar" is disabled while there is nothing captured, enabled from the
// first photo on, and it is the only way the batch leaves this screen. There is
// no second "back" affordance: the sheet's own close button is the way out, and
// a duplicate inside the surface only competed with it on a tight phone screen.
// The resume button after one failed automatic resume is the only other manual
// affordance.
//
// COPY: every string goes through `t()`, never inline text, and it uses the
// product `ocr.camera_*` keys -- not the spike's `dev_camera_batch_*` block,
// whose wording is written for a diagnostic screen.
//
// The surface hands the parent `File[]` -- the exact shape the OCR flow already
// consumes -- and nothing else. It owns no upload, no job, no history.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { t } from '@/locales/i18n'
import { MAX_CAPTURES, useFramedCamera, type CameraErrorCode } from './useFramedCamera'
import { createShutterFeedback, unlockShutterAudio } from './shutterSound'
import './CameraCaptureSurface.css'

export type CameraCaptureSurfaceProps = {
  /** Page cap for one ticket. Defaults to the OCR contract's 10. */
  maxCaptures?: number
  /**
   * Called with the captured photos, in capture order, when the operator taps
   * "send". They are `File` objects, exactly what a file input produces, so
   * the existing OCR flow consumes them unchanged.
   *
   * This is the ONLY send path of the screen: there is no separate "done" step
   * that dumps the batch somewhere for a later button to pick it up. The host
   * validates and submits from here, in one action.
   */
  onSend: (files: File[]) => void
  /**
  /**
   * A refusal from the host, already in the user's language (the batch broke a
   * limit, there is no session, no context yet). It is shown right above the
   * send button because that is where the operator is looking when nothing
   * happens after the tap.
   */
  errorMessage?: string | null
  /**
   * The camera could not start at all: no `getUserMedia`, a rejected promise, a
   * denied permission or an unsupported device. Fired ONCE per mount, and only
   * before the camera ever went live -- a failure to come back from the
   * background is NOT this, it is `resume`, which the operator keeps.
   *
   * The reason travels with it because a denied permission and a device with no
   * camera are the same absence but not the same message: one is fixable in the
   * browser, the other is not. After this the surface has nothing left to show,
   * so the parent unmounts it and leaves its own sources in place. The parent
   * chooses the source; this surface never substitutes another one.
   */
  onUnavailable?: (reason: CameraErrorCode) => void
  /**
   * Start the stream as soon as the surface mounts. Defaults to true and there
   * is no "open camera" button: a host that passes `false` gets an idle preview
   * until it opens the camera itself.
   */
  autoOpen?: boolean
  className?: string
  /**
   * `card` (default) is the surface as a row of the host's column. `screen`
   * takes the whole viewport instead: the stage stops deriving its width from
   * the stream's shape and fills the screen, the video crops with cover, and
   * the controls float on top. Same surface, same state, different composition.
   */
  variant?: 'card' | 'screen'
  /**
   * Only meaningful in `screen`: the modal's own close button sits UNDER the
   * fixed layer, so the surface has to offer its own way out.
   */
  onClose?: () => void
}

function cameraErrorKey(error: CameraErrorCode): string {
  if (error === 'no_camera') return 'ocr.camera_error_no_camera'
  if (error === 'permission_denied') return 'ocr.camera_error_permission_denied'
  return 'ocr.camera_error_generic'
}

export function CameraCaptureSurface({
  maxCaptures,
  onSend,
  errorMessage,
  onUnavailable,
  autoOpen = true,
  className,
  variant = 'card',
  onClose,
}: CameraCaptureSurfaceProps) {
  const isScreen = variant === 'screen'
  const camera = useFramedCamera({ maxCaptures })
  const maxCount = maxCaptures ?? MAX_CAPTURES
  const isLive = camera.status === 'live'
  const { percent, armed, ready } = camera.travel

  const { open } = camera
  useEffect(() => {
    if (!autoOpen) return
    void open()
  }, [autoOpen, open])

  /**
   * "I cannot start" is told to the parent exactly once. `needsResume` is what
   * separates the two failures: a failed RESUME always raises it (the operator
   * gets the button below, and the captures are still there), while an initial
   * open failure leaves it false. Retrying behind the operator's back is not an
   * option, and neither is a dead black rectangle.
   */
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable

  /*
   * The tap must answer NOW. Encoding a 1080x1920 JPEG takes what it takes, so the
   * shot is acknowledged with a flash on the frame the finger lifts, independently
   * of when the blob lands. Without it, a 600 ms encode reads as "the button did
   * not work" and the operator taps again.
   */
  /* One instance for the session: it owns the audio context. */
  const shutterFeedbackRef = useRef(createShutterFeedback())
  const shutterFeedback = shutterFeedbackRef.current
  /* One listener for the whole session: the first touch anywhere (including the
     shutter itself) wakes the audio context, so the click is heard from the very
     first shot instead of the second. */
  useEffect(() => {
    const unlock = (): void => unlockShutterAudio()
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])
  const [flash, setFlash] = useState(false)
  const flashTimerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    },
    [],
  )
  const handleCapture = useCallback(() => {
    camera.capture()
    /* Acknowledged on three channels at once: the frame is taken, the screen
       flashes and the phone clicks. The operator is looking at the receipt, so
       sound is the one that reaches them without moving their eyes. */
    shutterFeedback.fire()
    setFlash(true)
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setFlash(false), 140)
  }, [camera])
  const unavailableReportedRef = useRef(false)
  /** A stream that was once live can be LOST (background trip, unplugged
   *  device); that is a resume, never "this device has no camera". */
  const everLiveRef = useRef(false)
  const cameraStatus = camera.status
  const cameraError = camera.error
  const needsResume = camera.needsResume
  useEffect(() => {
    if (cameraStatus === 'live') {
      everLiveRef.current = true
      return
    }
    if (cameraStatus !== 'error' || needsResume) return
    if (everLiveRef.current) return
    if (cameraError === null) return
    if (unavailableReportedRef.current) return
    unavailableReportedRef.current = true
    onUnavailableRef.current?.(cameraError)
  }, [cameraStatus, cameraError, needsResume])

  /**
   * A tap anywhere on the preview asks the camera to focus there. The hook
   * feature-detects `getCapabilities().focusMode` / `.pointsOfInterest` and
   * answers false when the device supports neither: nothing throws and the
   * shutter keeps working. Coordinates are normalised against the element the
   * user tapped, which is all a points-of-interest constraint needs.
   */
  /**
   * Touching the preview focuses NOW, but not by asking the platform for a focus
   * cycle -- that request is accepted and ignored on real phones. It runs the
   * software sweep: the range the device declares is walked and the sharpest stop
   * is kept. A device with no usable range keeps its own autofocus and the tap
   * simply does nothing visible, which is the honest outcome.
   */
  const handleTapFocus = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      void camera.autoFocus()
    },
    [camera.autoFocus],
  )

  /** The photos leave as `File[]` and the hook's state is NOT cleared here: if
   *  the host refuses the batch (a limit, no context) the operator is still on
   *  this screen with every shot in place. When the host accepts it, it stops
   *  rendering the surface, and the hook's unmount cleanup releases the stream
   *  and the object URLs on its own. */
  const handleSend = useCallback(() => {
    onSend(camera.files)
  }, [camera.files, onSend])

  const progressState = !armed
    ? t('ocr.camera_shift_waiting')
    : ready
      ? t('ocr.camera_shift_ready')
      : t('ocr.camera_shift_keep_going')

  // Only the two states where the preview is genuinely on its way back say
  // something. Everything else that is not live is handled elsewhere: an
  // initial failure leaves the parent's message, and a failed resume leaves the
  // error line plus the resume button.
  const stageHint =
    camera.status === 'opening' || camera.status === 'suspended'
      ? t('ocr.camera_starting')
      : null

  return (
    <div
      className={`camera-surface${isScreen ? ' camera-surface--screen' : ''}${
        className === undefined ? '' : ` ${className}`
      }`}
    >
      {isScreen && (
        <div className="camera-surface-topbar">
          <button
            type="button"
            className="camera-surface-close"
            onClick={onClose ?? undefined}
            aria-label={t('ocr.camera_back')}
          >
            <span aria-hidden="true">×</span>
          </button>
          <span className="camera-surface-count-wrap">
            <span
              className="camera-surface-count"
              aria-live="polite"
              aria-label={t('ocr.camera_count_label', { count: camera.count, max: maxCount })}
            >
              {camera.count}/{maxCount}
            </span>
            {camera.count > 0 && (
              <button
                type="button"
                className="camera-surface-count-remove"
                onClick={() => camera.remove(camera.captures[camera.captures.length - 1].index)}
                aria-label={t('ocr.camera_count_remove', { count: camera.count, max: maxCount })}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </span>
        </div>
      )}

      {/* No "back" affordance: the sheet's own close button (X) is the way out,
          and a second one only competed with it in a space that is already tight
          on a phone. */}
      {/* The box takes the shape the camera ACTUALLY delivers, read back from the
          track, and its own rounded border IS the framing box.

          There used to be a second, inner box with a hardcoded 9:16 plus four
          L-shaped white corners. The moment the stage started following the
          stream's real shape, that inner box landed in the middle of the filmed
          area marking nothing -- the owner saw white arcs floating over the
          image. The stage border already says where the shot ends, so the second
          box and its corners are gone. */}
      <div
        className="camera-surface-stage"
        style={
          !isScreen &&
          camera.videoInfo !== null &&
          camera.videoInfo.width > 0 &&
          camera.videoInfo.height > 0
            ? { aspectRatio: `${camera.videoInfo.width} / ${camera.videoInfo.height}` }
            : undefined
        }
        onClick={handleTapFocus}
      >
        <video
          ref={camera.attachVideo}
          className="camera-surface-video"
          playsInline
          muted
          autoPlay
        />
        {!isLive && stageHint !== null && (
          <span className="camera-surface-stage-hint">{stageHint}</span>
        )}

        <span className={`camera-surface-flash${flash ? ' is-on' : ''}`} aria-hidden="true" />

        {camera.focusing && (
          <span className="camera-surface-focusing" role="status">
            {t('ocr.camera_focusing')}
          </span>
        )}

        {/* Guidance lives ON the preview, not in its own row: a 58px band below
            the viewfinder was taken straight out of the shot, and on a phone the
            shot is the scarce resource. It is readable because it sits on its own
            dark strip. */}
        <div
          className={`camera-surface-progress${ready ? ' is-ready' : ''}${
            armed ? '' : ' is-waiting'
          }`}
        >
            <p className="camera-surface-progress-state" role="status">
              {progressState}
            </p>
          <div className="camera-surface-progress-track" aria-hidden="true">
            <span className="camera-surface-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {/* Guidance, never a gate: the shutter below stays enabled at any travel.
          The bar is the whole indication -- no percentage, no distance, no
          calibration. The sentence is the accessible content and announces its
          own changes. */}
      {camera.error !== null && (
        <p
          className={isScreen ? 'camera-surface-error camera-surface-overlay-note' : 'camera-surface-error'}
          role="alert"
        >
          {t(cameraErrorKey(camera.error))}
        </p>
      )}

      {/* The one automatic resume after a background trip already failed: ask
          once instead of retrying in a loop. Captures taken before the trip are
          still in the hook, so the batch is never lost to a locked screen. */}
      {needsResume && (
        <button
          type="button"
          className={
            isScreen
              ? 'btn btn-primary camera-surface-overlay-action'
              : 'btn btn-primary btn-full'
          }
          onClick={() => {
            void camera.resume()
          }}
        >
          {t('ocr.camera_resume')}
        </button>
      )}

      <div className={isScreen ? 'camera-surface-actions' : 'camera-surface-actions is-card'}>
        <button
          type="button"
          className="btn btn-primary btn-full btn-lg camera-surface-shutter"
          onClick={handleCapture}
          disabled={!camera.canCapture || camera.focusing}
        >
          {t('ocr.camera_capture')}
        </button>

        <button
            type="button"
            className="btn btn-outline btn-full btn-lg camera-surface-send"
            onClick={handleSend}
            disabled={camera.count === 0}
          >
            {t('ocr.camera_send')}
          </button>
      </div>

      {!isScreen && camera.capReached && (
        <p className="camera-surface-note">{t('ocr.camera_cap_reached')}</p>
      )}

      {errorMessage !== undefined && errorMessage !== null && (
        <p className={isScreen ? 'camera-surface-error camera-surface-overlay-note' : 'camera-surface-error'} role="alert">
          {errorMessage}
        </p>
      )}

      {/* The one primary action. `disabled` is the honest state of "no pages
          yet": sending an empty batch would hand the parent nothing. From the
          first photo on it is enabled, and it does in one tap what "done" plus
          "send" used to do in two.

          Secondary weight on purpose: while the sheet is open the action the
          owner repeats is the shutter, so two identical big green buttons would
          compete. Position and enablement already make this one obvious.

          It sits directly under the shutter ON PURPOSE, and the thumbnails come
          after it: with the strip in between, sending a batch meant scrolling,
          and the owner asked for one tap without ever leaving the shutter. */}
      {!isScreen && (
        <ul className="camera-surface-thumbs">
          {camera.captures.map(item => (
          <li key={item.index} className="camera-surface-thumb">
            {item.url === null ? (
              <div className="camera-surface-thumb-img is-empty">#{item.index}</div>
            ) : (
              <img
                src={item.url}
                alt={item.fileName}
                className="camera-surface-thumb-img"
              />
            )}
            <button
              type="button"
              className="camera-surface-thumb-remove"
              onClick={() => camera.remove(item.index)}
              aria-label={`${t('ocr.capture_remove')} ${item.index}`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
        </ul>
      )}
    </div>
  )
}
