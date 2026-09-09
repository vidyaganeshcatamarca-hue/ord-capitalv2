import { t } from '@/locales/i18n'
import './ConsentCheckbox.css'

interface ConsentCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  onOpenDoc: (doc: 'tyc' | 'privacidad') => void
}

export function ConsentCheckbox({ checked, onChange, disabled = false, onOpenDoc }: ConsentCheckboxProps) {
  return (
    <div className="consent-checkbox">
      <label className="consent-checkbox-label">
        <input
          type="checkbox"
          className="consent-checkbox-input"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="consent-checkbox-text">
          {t('consent_checkbox_label')}
        </span>
      </label>
      <div className="consent-checkbox-links">
        <button
          type="button"
          className="consent-link"
          onClick={() => onOpenDoc('tyc')}
        >
          {t('consent_tyc_link')}
        </button>
        <span className="consent-link-sep">·</span>
        <button
          type="button"
          className="consent-link"
          onClick={() => onOpenDoc('privacidad')}
        >
          {t('consent_privacidad_link')}
        </button>
      </div>
    </div>
  )
}
