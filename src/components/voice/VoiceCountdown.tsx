/**
 * VoiceCountdown — Voice v1
 * Circular countdown (30s -> 0) built with a plain SVG ring and CSS transitions.
 * No animation library involved: the ring is driven by `stroke-dashoffset`.
 */
import { t } from '@/locales/i18n'

export interface VoiceCountdownProps {
  /** Seconds left before the hard cut. */
  secondsRemaining: number
  /** Total length of the recording window, in seconds. */
  total: number
}

/** Ring geometry, kept in sync with the viewBox used below. */
const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function VoiceCountdown({ secondsRemaining, total }: VoiceCountdownProps) {
  const safeTotal = total > 0 ? total : 1
  const remaining = clamp(secondsRemaining, 0, safeTotal)
  const progress = remaining / safeTotal
  const dashOffset = CIRCUMFERENCE * (1 - progress)
  const label = t('voice.seconds_left', { seconds: Math.ceil(remaining) })

  return (
    <div className="voice-recorder-countdown">
      <svg
        className="voice-recorder-countdown-ring"
        viewBox="0 0 120 120"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="voice-recorder-countdown-track"
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
        />
        <circle
          className="voice-recorder-countdown-progress"
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="voice-recorder-countdown-value" role="timer" aria-live="polite" aria-label={label}>
        {Math.ceil(remaining)}
      </span>
    </div>
  )
}
