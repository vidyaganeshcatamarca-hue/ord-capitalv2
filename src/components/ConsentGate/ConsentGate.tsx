import { useState } from 'react'
import { t } from '@/locales/i18n'
import { ConsentCheckbox } from '@/components/ConsentCheckbox/ConsentCheckbox'
import { registrarConsentimiento } from '@/hooks/useConsentimientoLegal'
import './ConsentGate.css'

interface ConsentGateProps {
  onAccepted: () => void
  onOpenDoc: (doc: 'tyc' | 'privacidad') => void
}

export function ConsentGate({ onAccepted, onOpenDoc }: ConsentGateProps) {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handleAccept = async () => {
    if (!checked) return
    setLoading(true)
    setError(false)
    try {
      await registrarConsentimiento()
      onAccepted()
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="consent-gate">
      <div className="consent-gate-card">
        <h2 className="consent-gate-title">{t('consent_gate_title')}</h2>
        <p className="consent-gate-body">{t('consent_gate_body')}</p>

        <ConsentCheckbox
          checked={checked}
          onChange={setChecked}
          disabled={loading}
          onOpenDoc={onOpenDoc}
        />

        {error && (
          <p className="consent-gate-error">{t('toast_consent_error')}</p>
        )}

        <button
          type="button"
          className="btn btn-primary btn-full btn-lg"
          disabled={!checked || loading}
          onClick={handleAccept}
        >
          {loading ? t('btn_loading') : error ? t('consent_gate_retry') : t('consent_gate_accept')}
        </button>
      </div>
    </div>
  )
}
