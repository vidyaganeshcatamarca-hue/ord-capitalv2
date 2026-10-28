import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { t } from '@/locales/i18n'
import './PageBackButton.css'

interface PageBackButtonProps {
  /** Explicit destination. When omitted, the browser history is used. */
  to?: string
  /** Destination used when there is no history entry to go back to. */
  fallback?: string
  /**
   * "One level up" that is not a route change: switching an internal view of
   * the current page. Takes precedence over `to` and the history.
   */
  onBack?: () => void
  /** Accessible name. Defaults to the generic "back" label. */
  ariaLabel?: string
  /**
   * `row` — standalone row that owns the page gutter (default).
   * `plain` — no base styling: the host class owns the whole visual, so screens
   * that already look right keep their exact geometry.
   */
  variant?: 'row' | 'plain'
  /** Host class for the `plain` variant, or for a compact `row`/`plain` size. */
  className?: string
  /** Custom content: a glyph, or the label of a text-style back button. */
  children?: ReactNode
}

/**
 * Single source for the "back" affordance.
 *
 * Owner bug (dark mode audit): six different back-button implementations had
 * drifted apart, and three screens painted the arrow flush against the left
 * edge because their page class provided no horizontal padding. The row owns
 * the gutter now: it subtracts whatever padding the page already applies, so
 * the arrow always lands 16px from the edge (safe-area included) no matter
 * which page renders it. Screens that need a different look pass `plain` and
 * keep their own geometry, but the behaviour and the accessible name still
 * come from here.
 */
export function PageBackButton({
  to,
  fallback = '/',
  onBack,
  ariaLabel,
  variant = 'row',
  className,
  children,
}: PageBackButtonProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    if (to) {
      navigate(to)
      return
    }
    // react-router v6 keeps the history index in the state; idx 0 means this
    // tab has no in-app entry to return to, so the fallback is the only safe exit.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) {
      navigate(-1)
      return
    }
    navigate(fallback)
  }

  const button = (
    <button
      type="button"
      className={
        variant === 'plain'
          ? className
          : className
            ? `page-back-button ${className}`
            : 'page-back-button'
      }
      onClick={handleBack}
      // A button with visible text is named by that text; only the glyph-only
      // button needs an explicit label.
      aria-label={
        ariaLabel ??
        (typeof children === 'string' ? undefined : t('page_back_aria'))
      }
    >
      {children ?? <span aria-hidden="true">‹</span>}
    </button>
  )

  if (variant === 'plain') return button
  return <div className="page-back-row">{button}</div>
}

export default PageBackButton
