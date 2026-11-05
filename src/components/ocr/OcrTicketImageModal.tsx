// src/components/ocr/OcrTicketImageModal.tsx
// ============================================
// OCR - "Ver ticket" viewer over the LOCAL image copy
// ============================================
//
// Normative source: definitive PRD §65. The viewer consults the local store by
// `ocr_job_id` and never depends on a public backend URL. Several images keep
// their original order and can be navigated. A missing image degrades with a
// message and never breaks the card (§46).
//
// Zoom: a ticket must be readable, so the image supports pinch on touch devices,
// wheel and double click on desktop, plus explicit buttons that work with a
// keyboard. Zoom is local to the viewer and resets when the image changes.
//
// Portaled with its own overlay: the page-scoped `.modal-*` classes only exist
// in the sheets of Saneamiento/Presupuestos, so this modal must not depend on
// them (it also renders fine if moved out of the tray later).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/locales/i18n'
import { useOcrImages } from '@/ocr/useOcrImages'
import './Ocr.css'

interface OcrTicketImageModalProps {
  jobId: string
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5

interface Point {
  x: number
  y: number
}

export function OcrTicketImageModal({ jobId, onClose }: OcrTicketImageModalProps) {
  const { images, loading } = useOcrImages(jobId, true)
  const [index, setIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })

  const stageRef = useRef<HTMLDivElement | null>(null)
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
  const dragRef = useRef<{ origin: Point; start: Point } | null>(null)

  const available = images.filter((image) => image.url !== null)
  const current = available[Math.min(index, Math.max(0, available.length - 1))] ?? null
  const total = available.length

  const clampOffset = (next: Point, nextScale: number): Point => {
    const stage = stageRef.current
    if (!stage || nextScale <= 1) return { x: 0, y: 0 }
    // Keep the image edge glued to the frame: never pan into empty space.
    const maxX = (stage.clientWidth * (nextScale - 1)) / 2
    const maxY = (stage.clientHeight * (nextScale - 1)) / 2
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  const applyScale = (next: number): void => {
    const bounded = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next))
    setScale(bounded)
    setOffset((previous) => clampOffset(previous, bounded))
  }

  const resetZoom = (): void => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  // A new image starts unzoomed: keeping the previous zoom would mislead.
  useEffect(() => {
    resetZoom()
  }, [index, jobId])

  const distance = (touches: React.TouchList): number => {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (event.touches.length === 2) {
      pinchRef.current = { distance: distance(event.touches), scale }
      dragRef.current = null
      return
    }
    if (event.touches.length === 1 && scale > 1) {
      const touch = event.touches[0]
      dragRef.current = { origin: offset, start: { x: touch.clientX, y: touch.clientY } }
    }
  }

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault()
      const ratio = distance(event.touches) / pinchRef.current.distance
      applyScale(pinchRef.current.scale * ratio)
      return
    }
    if (event.touches.length === 1 && dragRef.current) {
      event.preventDefault()
      const touch = event.touches[0]
      const next = {
        x: dragRef.current.origin.x + (touch.clientX - dragRef.current.start.x),
        y: dragRef.current.origin.y + (touch.clientY - dragRef.current.start.y),
      }
      setOffset(clampOffset(next, scale))
    }
  }

  const onTouchEnd = (): void => {
    pinchRef.current = null
    dragRef.current = null
  }

  const onWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    // Wheel over the ticket means zoom; the page behind must not scroll.
    event.preventDefault()
    applyScale(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15))
  }

  const onDoubleClick = (): void => {
    if (scale > 1) resetZoom()
    else applyScale(DOUBLE_TAP_SCALE)
  }

  return createPortal(
    <div
      className="ocr-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.view_ticket')}
    >
      <div className="ocr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ocr-modal-header">
          <h3>{t('ocr.view_ticket')}</h3>
          <button className="ocr-modal-close" onClick={onClose} aria-label={t('ocr.capture_cancel')}>
            ×
          </button>
        </div>
        <div className="ocr-modal-body">
          {loading ? (
            <div className="ocr-viewer-empty">
              <div className="spinner" />
            </div>
          ) : current ? (
            <div className="ocr-viewer">
              <div
                className={`ocr-viewer-stage${scale > 1 ? ' ocr-viewer-stage--zoomed' : ''}`}
                ref={stageRef}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onWheel={onWheel}
                onDoubleClick={onDoubleClick}
              >
                <img
                  src={current.url as string}
                  alt={t('ocr.view_ticket')}
                  draggable={false}
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  }}
                />
              </div>

              <div className="ocr-viewer-zoom" role="group" aria-label={t('ocr.zoom_hint')}>
                <button
                  type="button"
                  className="ocr-icon-btn"
                  onClick={() => applyScale(scale / 1.4)}
                  disabled={scale <= MIN_SCALE}
                  aria-label={t('ocr.zoom_out')}
                >
                  −
                </button>
                <span className="ocr-viewer-zoom-value">{Math.round(scale * 100)}%</span>
                <button
                  type="button"
                  className="ocr-icon-btn"
                  onClick={() => applyScale(scale * 1.4)}
                  disabled={scale >= MAX_SCALE}
                  aria-label={t('ocr.zoom_in')}
                >
                  +
                </button>
                <button
                  type="button"
                  className="ocr-icon-btn"
                  onClick={resetZoom}
                  disabled={scale <= MIN_SCALE}
                  aria-label={t('ocr.zoom_reset')}
                >
                  ⟲
                </button>
              </div>

              {total > 1 && (
                <div className="ocr-viewer-nav">
                  <button
                    type="button"
                    className="ocr-icon-btn"
                    onClick={() => setIndex((value) => Math.max(0, value - 1))}
                    disabled={index <= 0}
                    aria-label={t('ocr.capture_move_up')}
                  >
                    ‹
                  </button>
                  <span>
                    {t('ocr.image_counter', { index: String(index + 1), total: String(total) })}
                  </span>
                  <button
                    type="button"
                    className="ocr-icon-btn"
                    onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
                    disabled={index >= total - 1}
                    aria-label={t('ocr.capture_move_down')}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="ocr-viewer-empty">{t('ocr.image_unavailable')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
