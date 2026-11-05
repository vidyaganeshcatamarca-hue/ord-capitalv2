// src/components/ocr/OcrTicketEditModal.tsx
// ============================================
// OCR - full-screen ticket editor
// ============================================
//
// Mirrors the quarantine editor Voice already uses (`EditarCuarentenaModal`):
// a full-width sheet on mobile, a centred panel on desktop, a scrollable body
// and the two actions pinned at the bottom.
//
// It is a shell on purpose. The editable ticket form owns real state (items,
// payment, grouping, cent arithmetic, buildTicket), so it stays where it lives
// and is passed in as children: this component only provides the frame and the
// Guardar/Cancelar contract. Voice's shared modal is untouched.

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/locales/i18n'
import './Ocr.css'

interface OcrTicketEditModalProps {
  children: ReactNode
  onClose: () => void
  onSave: () => void
  saving: boolean
  saveDisabled: boolean
}

export function OcrTicketEditModal({
  children,
  onClose,
  onSave,
  saving,
  saveDisabled,
}: OcrTicketEditModalProps) {
  return createPortal(
    <div
      className="ocr-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.quarantine_title')}
    >
      <div className="ocr-modal ocr-modal--editor" onClick={(event) => event.stopPropagation()}>
        <div className="ocr-modal-header">
          <h3>{t('ocr.quarantine_title')}</h3>
          <button className="ocr-modal-close" onClick={onClose} aria-label={t('ocr.capture_cancel')}>
            ×
          </button>
        </div>

        <div className="ocr-modal-body">{children}</div>

        <div className="ocr-modal-footer">
          <button
            type="button"
            className="btn ocr-action-btn"
            onClick={onClose}
            disabled={saving}
          >
            {t('ocr.capture_cancel')}
          </button>
          <button
            type="button"
            className="saneamiento-btn-editar ocr-action-btn"
            onClick={onSave}
            disabled={saving || saveDisabled}
          >
            {saving ? t('ocr.saving') : t('ocr.save_draft')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
