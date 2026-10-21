import { SUPPORTED, languageLabel, type Lang } from '@/locales/language'

interface LanguageSelectProps {
  /** The language currently in effect. */
  value: Lang
  /** Called with the picked language. */
  onChange: (lang: Lang) => void
  /** Accessible name of the control. */
  label: string
  id: string
  /**
   * Extra class for the control. The `config-section-select` class restores
   * the native arrow that the global input rule removes; without it the
   * dropdown looks like a plain text field.
   */
  className?: string
}

/**
 * The language picker, shared by onboarding and Ajustes.
 *
 * The option names come from `Intl.DisplayNames`, so each language is written
 * in itself ("español", "English", "português") and the user recognizes it no
 * matter which language the app is currently showing. Shipping a new language
 * needs no new dictionary key.
 */
export function LanguageSelect({ value, onChange, label, id, className }: LanguageSelectProps) {
  return (
    <select
      id={id}
      className={className}
      value={value}
      aria-label={label}
      onChange={(e) => {
        const next = e.target.value
        if (next) onChange(next as Lang)
      }}
    >
      {SUPPORTED.map((code) => (
        <option key={code} value={code}>
          {languageLabel(code)}
        </option>
      ))}
    </select>
  )
}
