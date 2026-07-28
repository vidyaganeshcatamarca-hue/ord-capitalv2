import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
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
  const sheetRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    setSaldoReal(billetera.saldo_actual.toString())
  }, [billetera.billetera_id])

  // Cuando el teclado se abre (visualViewport.height cae por debajo de
  // window.innerHeight), subimos el bottom-sheet para que el footer sticky
  // (Cancelar / Confirmar) siempre quede visible arriba del teclado.
  // visualViewport funciona en iOS Safari, Android Chrome y web.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const handleResize = () => {
      const el = sheetRef.current
      if (!el) return
      const offset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
      el.style.maxHeight = `${Math.max(240, vv.height - 8)}px`
      // Subir el modal cuando el teclado está abierto
      el.style.bottom = offset > 0 ? `${offset}px` : '0'
    }
    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)
    handleResize()
    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
    }
  }, [])

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') setSaldoReal('')
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() === '') setSaldoReal('0')
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
      <div ref={sheetRef} className="bottom-sheet wallet-modal-sheet">
        <div className="bottom-sheet-handle" />
        <form onSubmit={handleSubmit} className="wallet-modal-form">
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
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  enterKeyHint="done"
                  data-lpignore="true"
                  data-form-type="other"
                  data-lpignore="true"
                  data-form-type="other"
                  className="form-control font-mono"
                  style={{ paddingLeft: 45, fontSize: '18px', fontWeight: 'bold' }}
                  value={saldoReal}
                  onChange={(e) => {
                    // Allow only digits and decimal separator
                    const raw = e.target.value
                    if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
                      setSaldoReal(raw)
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
                  autoFocus
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
