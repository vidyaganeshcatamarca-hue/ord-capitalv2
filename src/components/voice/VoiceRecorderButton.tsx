/**
 * VoiceRecorderButton — Voice v1
 * Round press-and-hold button: keep it pressed to record, release to send.
 * Purely presentational: the recording lifecycle lives in `useVoiceRecorder`
 * and the flow decisions live in `VoiceRecorderModal`.
 */
import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Mic } from 'lucide-react'

export interface VoiceRecorderButtonProps {
  /** Fired once, when the press starts on an enabled button. */
  onPressStart: () => void
  /** Fired once per press, on release or cancellation. */
  onPressEnd: () => void
  disabled?: boolean
  /** Accessible name of the button (already localized by the caller). */
  label: string
}

export function VoiceRecorderButton({
  onPressStart,
  onPressEnd,
  disabled = false,
  label,
}: VoiceRecorderButtonProps) {
  const [pressed, setPressed] = useState(false)
  // Guard so release/cancel/leave can never fire `onPressEnd` twice.
  const pressedRef = useRef(false)

  const releaseCapture = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Pointer capture is a progressive enhancement: losing it is not fatal.
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (disabled || pressedRef.current) return
      event.preventDefault()
      pressedRef.current = true
      setPressed(true)
      try {
        // Keeps the pointerup on this button even if the finger slides away.
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Fallback path: pointerup/pointerleave on the button still resolve the press.
      }
      onPressStart()
    },
    [disabled, onPressStart]
  )

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (!pressedRef.current) return
      pressedRef.current = false
      setPressed(false)
      releaseCapture(event)
      onPressEnd()
    },
    [onPressEnd, releaseCapture]
  )

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      // While the pointer is captured, sliding off the button must not end the
      // press: leaving is only a release fallback without capture support.
      if (event.currentTarget.hasPointerCapture(event.pointerId)) return
      handlePointerEnd(event)
    },
    [handlePointerEnd]
  )

  return (
    <button
      type="button"
      className={`voice-recorder-button ${pressed ? 'is-pressed' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Mic size={30} aria-hidden="true" />
    </button>
  )
}
