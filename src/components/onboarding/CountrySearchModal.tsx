import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { t } from '@/locales/i18n'
import {
  currencyName,
  exampleCountries,
  flagEmoji,
  regionName,
  searchCountries,
  type Country,
  type CountryIndex,
} from '@/lib/countryCatalog'

interface CountrySearchModalProps {
  open: boolean
  index: CountryIndex
  /** Active UI language, used only to localize the displayed names. */
  lang: string
  onClose: () => void
  onSelect: (country: Country) => void
}

// Inline styles: this component has no stylesheet of its own and must not
// reach outside its file. The overlay reuses the app's surface tokens.
//
// Owner bug (tanda 5): the sheet used to be vertically centred, so the moment
// the keyboard opened only the first country stayed visible. It now hangs from
// the top and caps its height with the DYNAMIC viewport unit, which shrinks when
// the keyboard appears (vh does not on Android).
const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(8px)',
  zIndex: 1100,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '12px 16px',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  /* Keyboard aware: dvh follows the visible viewport, vh does not. */
  maxHeight: 'min(80vh, calc(100dvh - 96px))',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  boxShadow: 'var(--shadow-xl)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  borderBottom: '1px solid var(--border)',
}

const inputStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  padding: '12px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--text)',
  fontSize: 'calc(16px * var(--font-scale))',
  outline: 'none',
}

const closeStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-3)',
  fontSize: 'calc(18px * var(--font-scale))',
  cursor: 'pointer',
  padding: '4px',
  lineHeight: 1,
}

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '8px 10px',
  background: 'none',
  border: 'none',
  borderRadius: '10px',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 'calc(15px * var(--font-scale))',
}

const emptyStyle: CSSProperties = {
  padding: '24px 12px',
  textAlign: 'center',
  color: 'var(--text-3)',
}

const hintStyle: CSSProperties = {
  margin: '0 0 8px',
  padding: '0 4px',
  color: 'var(--text-2)',
  fontSize: 'calc(12px * var(--font-scale))',
  lineHeight: 1.3,
}

/**
 * Country picker for choosing the currency of a wallet.
 *
 * Owner rule (tanda 4): it opens with five alphabetical examples and, the
 * moment the user types, those five become the closest matches — never a blank
 * box, never the full catalog. Copy states what the picker is for.
 */
export function CountrySearchModal({ open, index, lang, onClose, onSelect }: CountrySearchModalProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset on every open so a previous query never leaks into a new search.
  useEffect(() => {
    if (!open) return
    setQuery('')
    inputRef.current?.focus()
  }, [open])

  const results = useMemo(
    () =>
      open
        ? query.trim() === ''
          ? exampleCountries(index, lang, 5)
          : searchCountries(index, query, 5)
        : [],
    [open, index, lang, query]
  )

  if (!open) return null

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={headerStyle}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('onboarding_country_search_placeholder')}
            style={inputStyle}
            aria-label={t('onboarding_country_search_placeholder')}
          />
          <button type="button" onClick={onClose} aria-label={t('btn_close')} style={closeStyle}>
            ✕
          </button>
        </div>

        <div style={listStyle}>
          <p style={hintStyle}>{t('onboarding_country_picker_hint')}</p>

          {query.trim() !== '' && results.length === 0 && (
            <p style={emptyStyle}>{t('onboarding_country_empty')}</p>
          )}

          {results.map((country) => (
            <button
              key={country.code}
              type="button"
              onClick={() => onSelect(country)}
              style={rowStyle}
            >
              <span aria-hidden="true" style={{ fontSize: '24px', lineHeight: 1 }}>
                {flagEmoji(country.code)}
              </span>
              {/* Tanda 3 (owner): rows read "PAIS — CODE"; the currency NAME
                  belongs in the selection field, not here. */}
              <span style={{ flex: 1, textAlign: 'left' }}>
                {regionName(country.code, lang)} — {country.localCurrency}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
