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
          aria-label={t('consent_checkbox_label')}
        />
        <span className="consent-checkbox-box" aria-hidden="true">
          <svg
            className="consent-checkbox-tick"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 8.5 L6.5 12 L13 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
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
