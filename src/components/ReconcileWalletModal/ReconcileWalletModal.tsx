import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { t, parseError } from '@/locales/i18n'
import { Billetera } from '@/types/Billetera'

interface Props {
  billetera: Billetera
  formatAmount: (monto: number, moneda: string) => string
  onClose: () => void
  onSuccess?: () => void
}

export function ReconcileWalletModal({ billetera, formatAmount, onClose, onSuccess }: Props) {
  const [saldoReal, setSaldoReal] = useState(billetera.saldo_actual.toString())
  const [loading, setLoading] = useState(false)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const { prefs } = useNumberFormat()

  useEffect(() => {
    setSaldoReal(billetera.saldo_actual.toString())
  }, [billetera.billetera_id])

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(rafId)
  }, [])

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') setSaldoReal('')
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() === '') setSaldoReal('0')
  }

  // Display formatting honors the user's number-format preferences
  // (separador_miles / separador_decimal) and the wallet currency's
  // decimal count, exactly like formatMonto does. State stays raw
  // (dot-decimal) so parseFloat keeps working.
  const formatDisplay = (raw: string): string => {
    if (raw === '' || raw === '-') return raw
    const neg = raw.startsWith('-')
    const body = neg ? raw.slice(1) : raw
    const [intPart, decPart] = body.split('.')
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, prefs.separador_miles)
    return (neg ? '-' : '') + grouped + (decPart !== undefined ? prefs.separador_decimal + decPart : '')
  }

  const handleConfirm = async () => {
    if (loading) return
    const saldoNum = parseFloat(saldoReal)
    if (isNaN(saldoNum)) {
      showToast(t('error_field_invalid', { field: t('reconcile_label_real') }), 'error')
      return
    }

    setLoading(true)
    try {
      await rpc('fn_ejecutar_conciliacion', {
        p_billetera_id: billetera.billetera_id,
        p_saldo_real: saldoNum
      })

      const diff = saldoNum - Number(billetera.saldo_actual)
      if (diff === 0) {
        showToast(t('reconcile_success_no_diff'), 'success')
      } else {
        showToast(t('reconcile_success_with_diff', { category: t('cat_mystery') }), 'success')
      }

      onSuccess?.()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleConfirm()
  }

  const modalContent = (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div className="bottom-sheet wallet-modal-sheet sheet-top">
        <div className="bottom-sheet-handle" />
        <form onSubmit={handleSubmit} className="wallet-modal-form" autoComplete="off">
          <div className="wallet-modal-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 className="font-display" style={{ fontSize: '18px', margin: 0 }}>
                {t('reconcile_modal_title', { nombre: t(billetera.nombre) })}
              </h3>
              <button type="button" className="text-xs text-muted" onClick={onClose} disabled={loading}>
                {t('btn_close')}
              </button>
            </div>

            <div className="card mb-3" style={{ background: 'var(--surface-2)', textAlign: 'center', padding: 'var(--space-3)' }}>
              <p className="text-xs text-muted uppercase tracking-wider mb-1">{t('reconcile_label_theoretical')}</p>
              <p className="font-mono font-bold" style={{ fontSize: '22px', color: 'var(--text)' }}>
                {formatAmount(billetera.saldo_actual, billetera.moneda)}
              </p>
            </div>

            <div className="form-group mb-4">
              <label className="text-xs text-muted mb-2 block font-semibold">{t('reconcile_label_real')}</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                  {billetera.moneda === 'USD' ? 'U$S' : '$'}
                </span>
                <input
                  ref={inputRef}
                  type="tel"
                  inputMode="decimal"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  enterKeyHint="done"
                  data-lpignore="true"
                  data-form-type="other"
                  className="form-control font-mono"
                  style={{ paddingLeft: 45, fontSize: '18px', fontWeight: 'bold' }}
                  value={formatDisplay(saldoReal)}
                  onChange={(e) => {
                    // Display may contain user-configured group/decimal
                    // separators; normalize back to raw dot-decimal before
                    // validating and storing
                    const normalized = e.target.value
                      .split(prefs.separador_miles).join('')
                      .replace(prefs.separador_decimal, '.')
                    if (normalized === '' || /^-?\d*\.?\d*$/.test(normalized)) {
                      setSaldoReal(normalized)
                    }
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      confirmBtnRef.current?.focus()
                    }
                  }}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="wallet-modal-actions">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={loading}>
              {t('reconcile_btn_cancel')}
            </button>
            <button
              type="submit"
              ref={confirmBtnRef}
              className="btn btn-primary flex-1"
              disabled={loading}
            >
              {loading ? t('reconcile_loading') : t('reconcile_btn_confirm')}
            </button>
          </div>
        </form>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}
