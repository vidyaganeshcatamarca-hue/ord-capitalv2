import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { t, parseError } from '@/locales/i18n'
import { Billetera } from '@/types/Billetera'

interface Props {
  billetera: Billetera
  onClose: () => void
  onSuccess: () => void
}

export function InitialBalanceModal({ billetera, onClose, onSuccess }: Props) {
  const [initialBalanceValue, setInitialBalanceValue] = useState('0')
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') setInitialBalanceValue('')
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() === '') setInitialBalanceValue('0')
  }

  const handleCompleteInitialBalance = async () => {
    const saldoNum = parseFloat(initialBalanceValue)
    if (isNaN(saldoNum) || saldoNum < 0) {
      showToast(t('toast_invalid_opening_balance'), 'error')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('fn_completar_saldo_inicial_billetera', {
        p_billetera_id: billetera.billetera_id,
        p_saldo_apertura: saldoNum
      })
      if (error) throw error

      showToast(t('wallet_initial_balance_completed'), 'success')
      onSuccess()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const modalContent = (
    <>
      <style>{`
        div.bottom-sheet.wallet-modal-sheet.initial-balance-modal-sheet {
          z-index: 100000 !important;
        }
      `}</style>
      <div className="bottom-sheet-overlay" style={{ zIndex: 99999 }} onClick={onClose} />
      <div className="bottom-sheet wallet-modal-sheet initial-balance-modal-sheet">
        <div className="bottom-sheet-handle" />
        <div style={{ padding: 'var(--space-2) var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h3 className="font-display" style={{ fontSize: '18px', margin: 0 }}>
              {t('wallet_complete_initial_balance_title', { name: billetera.nombre })}
            </h3>
            <button type="button" className="text-xs text-muted" onClick={onClose} disabled={loading}>{t('btn_close')}</button>
          </div>

          <div className="card mb-3" style={{ background: 'var(--surface-2)', padding: 'var(--space-3)' }}>
            <p className="text-sm text-muted" style={{ margin: 0 }}>{t('wallet_complete_initial_balance_desc')}</p>
          </div>

          <div className="form-group mb-4">
            <label className="text-xs text-muted mb-2 block font-semibold">{t('wallet_initial_balance_amount')}</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                {billetera.moneda === 'USD' ? 'U$S' : '$'}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control font-mono"
                style={{ paddingLeft: 45, fontSize: '18px', fontWeight: 'bold' }}
                value={initialBalanceValue}
                onChange={(e) => setInitialBalanceValue(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button className="btn btn-secondary flex-1" onClick={onClose} disabled={loading}>
              {t('btn_cancel')}
            </button>
            <button className="btn btn-primary flex-1" onClick={handleCompleteInitialBalance} disabled={loading}>
              {loading ? t('btn_saving') : t('wallet_complete_initial_balance')}
            </button>
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}
