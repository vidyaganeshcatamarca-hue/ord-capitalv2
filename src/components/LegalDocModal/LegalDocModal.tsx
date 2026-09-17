import { useEffect } from 'react'
import { t } from '@/locales/i18n'
import { registrarAperturaLegal } from '@/hooks/useConsentimientoLegal'
import './LegalDocModal.css'

interface LegalDocModalProps {
  doc: 'tyc' | 'privacidad'
  open: boolean
  onClose: () => void
}

const DOC_SRC: Record<'tyc' | 'privacidad', string> = {
  tyc: '/legal/tyc.html',
  privacidad: '/legal/privacidad.html',
}

const DOC_TITLE_KEY: Record<'tyc' | 'privacidad', string> = {
  tyc: 'consent_tyc_link',
  privacidad: 'consent_privacidad_link',
}

export function LegalDocModal({ doc, open, onClose }: LegalDocModalProps) {
  // Telemetría Tanda 2: marcar apertura del documento legal (best-effort)
  useEffect(() => {
    if (open) void registrarAperturaLegal(doc)
  }, [open, doc])

  if (!open) return null

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div className="legal-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="legal-modal-header">
          <h3 className="legal-modal-title">{t(DOC_TITLE_KEY[doc])}</h3>
          <button type="button" className="legal-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ✕
          </button>
        </div>
        <iframe
          className="legal-modal-frame"
          src={DOC_SRC[doc]}
          title={t(DOC_TITLE_KEY[doc])}
        />
      </div>
    </div>
  )
}
