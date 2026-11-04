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
// Portaled with its own overlay: the page-scoped `.modal-*` classes only exist
// in the sheets of Saneamiento/Presupuestos, so this modal must not depend on
// them (it also renders fine if moved out of the tray later).

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/locales/i18n'
import { useOcrImages } from '@/ocr/useOcrImages'
import './Ocr.css'

interface OcrTicketImageModalProps {
  jobId: string
  onClose: () => void
}

export function OcrTicketImageModal({ jobId, onClose }: OcrTicketImageModalProps) {
  const { images, loading } = useOcrImages(jobId, true)
  const [index, setIndex] = useState(0)

  const available = images.filter((image) => image.url !== null)
  const current = available[Math.min(index, Math.max(0, available.length - 1))] ?? null
  const total = available.length

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
              <img src={current.url as string} alt={t('ocr.view_ticket')} />
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
