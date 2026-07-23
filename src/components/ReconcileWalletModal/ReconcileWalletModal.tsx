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
  const { showToast } = useToast()

  useEffect(() => {
    setSaldoReal(billetera.saldo_actual.toString())
  }, [billetera.billetera_id])

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
      <div className="bottom-sheet wallet-modal-sheet">
        <div className="bottom-sheet-handle" />
        <form onSubmit={handleSubmit} style={{ padding: 'var(--space-2) var(--space-2)' }}>
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
                type="number"
                step="0.01"
                className="form-control font-mono"
                style={{ paddingLeft: 45, fontSize: '18px', fontWeight: 'bold' }}
                value={saldoReal}
                onChange={(e) => setSaldoReal(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                enterKeyHint="next"
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

          <div className="flex gap-3">
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
